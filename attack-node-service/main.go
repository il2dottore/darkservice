package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"text/template"
	"time"

	"github.com/joho/godotenv"
	amqp "github.com/rabbitmq/amqp091-go"
)

var active atomic.Int64
var statusChannel *amqp.Channel
var statusMu sync.Mutex
var processMu sync.Mutex
var processes = map[int]context.CancelFunc{}
var processGroups = map[int]int{}
var cancelled = map[int]bool{}

type HealthResponse struct {
	Active int64   `json:"active"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Fatalf("cannot read .env file: %v", err)
	}
	if err := LoadCommandConfig(os.Getenv("ATTACK_COMMANDS_FILE")); err != nil {
		log.Fatal(err)
	}
	conn, err := amqp.Dial(os.Getenv("RABBITMQ_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	statusChannel, err = conn.Channel()
	if err != nil {
		log.Fatal(err)
	}
	defer statusChannel.Close()
	queue := os.Getenv("RABBITMQ_ATTACK_STATUS_QUEUE")
	if _, err = statusChannel.QueueDeclare(queue, true, false, false, false, nil); err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", health)
	mux.HandleFunc("/attacks", HandleAttack)
	mux.HandleFunc("/attacks/", StopAttack)
	addr := "0.0.0.0:" + os.Getenv("LISTEN_PORT")
	log.Printf("attack node listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	cpu, memory := SystemUsage()
	json.NewEncoder(w).Encode(HealthResponse{
		Active: active.Load(),
		CPU:    cpu,
		Memory: memory,
	})
}

// SystemUsage returns host-wide CPU and memory usage percentages. Linux exposes
// both values through procfs, which avoids adding a platform-specific runtime
// dependency to the attack node.
func SystemUsage() (float64, float64) {
	return RoundOneDecimal(CpuUsage()), RoundOneDecimal(MemoryUsage())
}

func RoundOneDecimal(value float64) float64 {
	return math.Round(value*10) / 10
}

func CpuUsage() float64 {
	read := func() (idle, total uint64, ok bool) {
		data, err := os.ReadFile("/proc/stat")
		if err != nil {
			return 0, 0, false
		}
		for line := range strings.SplitSeq(string(data), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 5 || fields[0] != "cpu" {
				continue
			}
			var values []uint64
			for _, field := range fields[1:] {
				value, err := strconv.ParseUint(field, 10, 64)
				if err != nil {
					return 0, 0, false
				}
				values = append(values, value)
			}
			var sum uint64
			for _, value := range values {
				sum += value
			}
			return values[3] + values[4], sum, true
		}
		return 0, 0, false
	}

	idle1, total1, ok := read()
	if !ok {
		return 0
	}
	time.Sleep(100 * time.Millisecond)
	idle2, total2, ok := read()
	if !ok || total2 <= total1 {
		return 0
	}
	busy := (total2 - total1) - (idle2 - idle1)
	return float64(busy) * 100 / float64(total2-total1)
}

func MemoryUsage() float64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	var total, available uint64
	for line := range strings.SplitSeq(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			total = value
		case "MemAvailable:":
			available = value
		}
	}
	if total == 0 || available > total {
		return 0
	}
	return float64(total-available) * 100 / float64(total)
}

func HandleAttack(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(writer, "method not allowed", 405)
		return
	}

	// Lazy declaration for the payload sent by the backend node-router service.
	var rawAttackEventJsonString map[string]any
	// Decode `raw` to map[string]any
	if err := json.NewDecoder(request.Body).Decode(&rawAttackEventJsonString); err != nil {
		http.Error(writer, "invalid payload", 400)
		return
	}

	log.Printf("[ATTACK-NODE] request received: %s", string(MustJSON(rawAttackEventJsonString)))
	layer, _ := rawAttackEventJsonString["layer"].(string)
	if layer == "LAYER_4" {
		var attackPayload Layer4AttackPayload
		buffer, _ := json.Marshal(rawAttackEventJsonString)
		if json.Unmarshal(buffer, &attackPayload) != nil {
			http.Error(writer, "invalid payload", 400)
			return
		}
		go RunLayer4Attack(attackPayload)
	} else {
		var attackPayload Layer7AttackPayload
		buffer, _ := json.Marshal(rawAttackEventJsonString)
		if json.Unmarshal(buffer, &attackPayload) != nil {
			http.Error(writer, "invalid payload", 400)
			return
		}
		go RunLayer7Attack(attackPayload)
	}
	log.Printf("[ATTACK-NODE] attack accepted: id=%v layer=%s", rawAttackEventJsonString["id"], layer)
	writer.WriteHeader(http.StatusAccepted)
}

func ValidateLayer4(p Layer4AttackPayload) error {
	if _, ok := Layer4Methods[p.Method]; !ok {
		return fmt.Errorf("unknown method %q", p.Method)
	}
	if p.Port < 1 || p.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if p.Duration < 1 || p.Duration > 300 {
		return fmt.Errorf("duration must be between 1 and 300 seconds")
	}
	if p.PPSLimit < 0 || p.PPSLimit > 100 {
		return fmt.Errorf("ppsLimit must be between 0 and 100 for mock mode")
	}
	return nil
}

/* ==================== SHELL PROCESSING ==================== */
func ShellCommand(context context.Context, command string) *exec.Cmd {
	return exec.CommandContext(context, "/bin/sh", "-c", command)
}

func ShellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

/* ==================== SHELL PROCESSING ==================== */

/* ==================== COMMANDS RENDERING ==================== */
func RenderLayer4Command(command string, p Layer4AttackPayload) (string, error) {
	t, err := template.New("layer4").Parse(command)
	if err != nil {
		return "", err
	}
	data := struct {
		Target, Port, Duration, PPS string
	}{
		Target:   ShellQuote(p.Target),
		Port:     ShellQuote(strconv.Itoa(p.Port)),
		Duration: ShellQuote(strconv.Itoa(p.Duration)),
		PPS:      ShellQuote(strconv.Itoa(p.PPSLimit)),
	}
	var out strings.Builder
	if err := t.Execute(&out, data); err != nil {
		return "", err
	}
	return out.String(), nil
}

func RenderLayer7Command(command string, p Layer7AttackPayload) (string, error) {
	t, err := template.New("attack").Parse(command)
	if err != nil {
		return "", err
	}
	data := struct {
		Target, Duration, Rate, RequestMethod, PostData string
	}{
		Target: ShellQuote(p.Target), Duration: ShellQuote(strconv.Itoa(p.Duration)),
		Rate: ShellQuote(strconv.Itoa(p.RateLimit)), RequestMethod: ShellQuote(p.RequestMethod),
		PostData: ShellQuote(p.PostData),
	}
	var out strings.Builder
	if err := t.Execute(&out, data); err != nil {
		return "", err
	}
	return out.String(), nil
}

/* ==================== COMMANDS RENDERING ==================== */

/* ==================== ATTACKS PROCESSING ==================== */
func RunLayer4Attack(attackPayload Layer4AttackPayload) {
	log.Printf("[ATTACK-NODE] attack %d started: layer=LAYER_4 method=%s target=%s", attackPayload.ID, attackPayload.Method, attackPayload.Target)

	// Increase active count with value locking
	active.Add(1)
	defer active.Add(-1)

	if err := ValidateLayer4(attackPayload); err != nil {
		PublishStatus(
      attackPayload.ID,
			"FAILED",
			fmt.Sprintf("Failed to validate Layer 4 target: %s", err.Error()),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}

	command, err := RenderLayer4Command(Layer4Methods[attackPayload.Method], attackPayload)
	if err != nil {
		PublishStatus(
			attackPayload.ID,
			"FAILED",
			"Invalid Layer 4 command template: "+err.Error(),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	timeoutContext, cancel := context.WithTimeout(context.Background(), time.Duration(attackPayload.Duration+5)*time.Second)
	defer cancel()
	processMu.Lock()
	processes[attackPayload.ID] = cancel
	delete(cancelled, attackPayload.ID)
	processMu.Unlock()
	defer func() {
		processMu.Lock()
		delete(processes, attackPayload.ID)
		delete(processGroups, attackPayload.ID)
		processMu.Unlock()
	}()

	PublishStatus(
		attackPayload.ID,
		"RUNNING",
		"",
		attackPayload.SlotKey,
		attackPayload.ServerID,
	)

	cmd := ShellCommand(timeoutContext, command)
	cmd.SysProcAttr = processGroupAttr()
	cmd.Dir = os.Getenv("ATTACK_SCRIPT_DIR")
	if err := cmd.Start(); err != nil {
		PublishStatus(
			attackPayload.ID,
			"FAILED",
			fmt.Sprintf("Failed to start attack with shell script: %s", err.Error()),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	processMu.Lock()
	processGroups[attackPayload.ID] = cmd.Process.Pid
	processMu.Unlock()
	err = cmd.Wait()
	processMu.Lock()
	wasCancelled := cancelled[attackPayload.ID]
	processMu.Unlock()
	if wasCancelled {
		return
	}
	if timeoutContext.Err() == context.DeadlineExceeded {
		PublishStatus(
			attackPayload.ID,
			"TIMEOUT",
			"Mock script exceeded timeout",
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	if err != nil {
		PublishStatus(
			attackPayload.ID,
			"FAILED",
			fmt.Sprintf("Failed to wait for attack script: %s", err.Error()),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	PublishStatus(
		attackPayload.ID,
		"COMPLETED",
		"",
		attackPayload.SlotKey,
		attackPayload.ServerID,
	)
}

func RunLayer7Attack(attackPayload Layer7AttackPayload) {
	log.Printf("[ATTACK-NODE] attack %d started: method=%s target=%s duration=%ds rate=%d requestMethod=%s", attackPayload.ID, attackPayload.Method, attackPayload.Target, attackPayload.Duration, attackPayload.RateLimit, attackPayload.RequestMethod)
	active.Add(1)
	defer active.Add(-1)

	// Compares method sent from database with method in JSON configuration file.
	template, ok := Layer7Methods[attackPayload.Method]
	if !ok {
		log.Printf("unknown method %s", attackPayload.Method)
		PublishStatus(
			attackPayload.ID,
			"FAILED",
			fmt.Sprintf("Unknown method %s, please try again.", attackPayload.Method),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}

	// Parse JSON config file for layer 7 attack configuration.
	log.Printf("[ATTACK-NODE] attack %d command template: %s", attackPayload.ID, template)
	command, err := RenderLayer7Command(template, attackPayload)
	if err != nil {
		PublishStatus(
			attackPayload.ID,
			"FAILED",
			"Invalid command template: "+err.Error(),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	log.Printf("[ATTACK-NODE] attack %d rendered command: %s", attackPayload.ID, command)

	// Gives process more 10 seconds to cleanup.
	timeoutContext, cancel := context.WithTimeout(context.Background(), time.Duration(attackPayload.Duration+10)*time.Second)
	defer cancel()
	processMu.Lock()
	processes[attackPayload.ID] = cancel
	delete(cancelled, attackPayload.ID)
	processMu.Unlock()
	defer func() {
		processMu.Lock()
		delete(processes, attackPayload.ID)
		delete(processGroups, attackPayload.ID)
		processMu.Unlock()
	}()
	// /bin/sh is provided by both Ubuntu (dash) and Alpine (BusyBox ash).
	cmd := ShellCommand(timeoutContext, command)
	cmd.SysProcAttr = processGroupAttr()
	cmd.Dir = os.Getenv("ATTACK_SCRIPT_DIR")
	if err := cmd.Start(); err != nil {
		PublishStatus(
			attackPayload.ID,
			"FAILED",
			fmt.Sprintf("Failed to start attack script: %s", err.Error()),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	processMu.Lock()
	processGroups[attackPayload.ID] = cmd.Process.Pid
	processMu.Unlock()
	log.Printf("[ATTACK-NODE] attack %d process started", attackPayload.ID)
	PublishStatus(
		attackPayload.ID,
		"RUNNING",
		"",
		attackPayload.SlotKey,
		attackPayload.ServerID,
	)
	err = cmd.Wait()
	log.Printf("[ATTACK-NODE] attack %d process finished: err=%v", attackPayload.ID, err)
	processMu.Lock()
	wasCancelled := cancelled[attackPayload.ID]
	processMu.Unlock()
	if wasCancelled {
		return
	}
	if timeoutContext.Err() == context.DeadlineExceeded {
		PublishStatus(
			attackPayload.ID,
			"TIMEOUT",
			"Attack script exceeded timeout",
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	if err != nil {
		PublishStatus(
			attackPayload.ID,
			"FAILED",
			fmt.Sprintf("Failed to wait for attack script: %s", err.Error()),
			attackPayload.SlotKey,
			attackPayload.ServerID,
		)
		return
	}
	PublishStatus(
		attackPayload.ID,
		"COMPLETED",
		"",
		attackPayload.SlotKey,
		attackPayload.ServerID,
	)
}

func StopAttack(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Get `id` from /attacks/{id}/stop.
	id, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(request.URL.Path, "/attacks/"), "/stop"))
	if err != nil {
		http.Error(writer, "invalid attack id", http.StatusBadRequest)
		return
	}
	processMu.Lock()
	cancel, running := processes[id]
	groupID := processGroups[id]
	if running {
		cancelled[id] = true
	}
	processMu.Unlock()
	if !running {
		http.Error(writer, "attack not running", http.StatusNotFound)
		return
	}
	log.Printf("[ATTACK-NODE] attack %d stop requested", id)
	cancel()
	if groupID > 0 {
		if err := killProcessGroup(groupID); err != nil {
			log.Printf("[ATTACK-NODE] attack %d process group kill failed: %v", id, err)
		}
	}

	// A stopped attack means that it is running so no need to pass slotKey and serverID.
	PublishStatus(
		id,
		"CANCELLED",
		"Attack was stopped by user",
		"",
	)
	writer.WriteHeader(http.StatusAccepted)
}

/* ==================== ATTACKS PROCESSING ==================== */

func PublishStatus(id int, status, reason, slotKey string, serverIDs ...int) {
	log.Printf("[ATTACK-NODE] attack %d status=%s reason=%q", id, status, reason)
	body, _ := json.Marshal(map[string]any{
		"pattern": "attack.updateStatus",
		"data": map[string]any{
			"id":            id,
			"status":        status,
			"failureReason": reason,
			"slotKey":       slotKey,
			"serverId":      FirstServerID(serverIDs),
		},
	})
	statusMu.Lock()
	defer statusMu.Unlock()
	_ = statusChannel.Publish(
		"",
		os.Getenv("RABBITMQ_ATTACK_STATUS_QUEUE"),
		false,
		false,
		amqp.Publishing{
			DeliveryMode: amqp.Persistent,
			ContentType:  "application/json",
			Body:         body,
		},
	)
}

func FirstServerID(serverIDs []int) int {
	if len(serverIDs) == 0 {
		return 0
	}
	return serverIDs[0]
}

func MustJSON(value any) []byte {
	b, err := json.Marshal(value)
	if err != nil {
		return []byte(`{"error":"unable to serialize payload"}`)
	}
	return b
}
