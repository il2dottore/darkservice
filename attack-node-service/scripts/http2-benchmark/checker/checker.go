package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/http2"
)

const defaultJudge = "https://cloudflare.com/cdn-cgi/trace"

var titleRE = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)

type proxyKind string

const (
	httpProxy   proxyKind = "http"
	socks4Proxy proxyKind = "socks4"
	socks5Proxy proxyKind = "socks5"
)

type proxyConfig struct {
	kind     proxyKind
	address  string
	username string
	password string
}

func parseProxy(raw string) (proxyConfig, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return proxyConfig{}, errors.New("proxy rỗng")
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}

	u, err := url.Parse(raw)
	if err != nil {
		return proxyConfig{}, fmt.Errorf("URL proxy không hợp lệ: %w", err)
	}
	if u.Hostname() == "" || u.Path != "" && u.Path != "/" || u.RawQuery != "" || u.Fragment != "" {
		return proxyConfig{}, errors.New("địa chỉ proxy không hợp lệ")
	}

	kind := proxyKind(strings.ToLower(u.Scheme))
	if kind != httpProxy && kind != socks4Proxy && kind != socks5Proxy {
		return proxyConfig{}, fmt.Errorf("scheme proxy không hỗ trợ: %q", u.Scheme)
	}

	port := u.Port()
	if port == "" {
		if kind == httpProxy {
			port = "80"
		} else {
			port = "1080"
		}
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return proxyConfig{}, fmt.Errorf("cổng proxy không hợp lệ: %q", port)
	}

	config := proxyConfig{
		kind:    kind,
		address: net.JoinHostPort(u.Hostname(), port),
	}
	if u.User != nil {
		config.username = u.User.Username()
		config.password, _ = u.User.Password()
	}
	return config, nil
}

func (p proxyConfig) dial(ctx context.Context, targetAddr string, timeout time.Duration) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	dialer := net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", p.address)
	if err != nil {
		return nil, err
	}
	if err := conn.SetDeadline(time.Now().Add(timeout)); err != nil {
		conn.Close()
		return nil, err
	}

	switch p.kind {
	case httpProxy:
		err = p.connectHTTP(conn, targetAddr)
	case socks4Proxy:
		err = p.connectSOCKS4(ctx, conn, targetAddr)
	case socks5Proxy:
		err = p.connectSOCKS5(conn, targetAddr)
	default:
		err = fmt.Errorf("proxy type không hỗ trợ: %s", p.kind)
	}
	if err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}

func (p proxyConfig) connectHTTP(conn net.Conn, targetAddr string) error {
	var request strings.Builder
	fmt.Fprintf(&request, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n", targetAddr, targetAddr)
	if p.username != "" || p.password != "" {
		credentials := base64.StdEncoding.EncodeToString([]byte(p.username + ":" + p.password))
		fmt.Fprintf(&request, "Proxy-Authorization: Basic %s\r\n", credentials)
	}
	request.WriteString("\r\n")
	if _, err := io.WriteString(conn, request.String()); err != nil {
		return err
	}

	resp, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: http.MethodConnect})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("CONNECT: %s", resp.Status)
	}
	return nil
}

func (p proxyConfig) connectSOCKS4(ctx context.Context, conn net.Conn, targetAddr string) error {
	host, portText, err := net.SplitHostPort(targetAddr)
	if err != nil {
		return err
	}
	port, err := strconv.ParseUint(portText, 10, 16)
	if err != nil || port == 0 {
		return fmt.Errorf("cổng đích không hợp lệ: %q", portText)
	}
	if strings.ContainsRune(p.username, '\x00') {
		return errors.New("SOCKS4 user ID không được chứa NUL")
	}

	var ipv4 net.IP
	if ip := net.ParseIP(host); ip != nil {
		ipv4 = ip.To4()
	} else {
		ips, lookupErr := net.DefaultResolver.LookupIPAddr(ctx, host)
		if lookupErr != nil {
			return fmt.Errorf("không phân giải được đích SOCKS4: %w", lookupErr)
		}
		for _, candidate := range ips {
			if candidate.IP.To4() != nil {
				ipv4 = candidate.IP.To4()
				break
			}
		}
	}
	if ipv4 == nil {
		return errors.New("SOCKS4 chỉ hỗ trợ địa chỉ IPv4")
	}

	request := make([]byte, 0, 9+len(p.username))
	request = append(request, 4, 1, byte(port>>8), byte(port))
	request = append(request, ipv4...)
	request = append(request, p.username...)
	request = append(request, 0)
	if _, err := conn.Write(request); err != nil {
		return err
	}

	response := make([]byte, 8)
	if _, err := io.ReadFull(conn, response); err != nil {
		return err
	}
	if response[0] != 0 || response[1] != 0x5a {
		return fmt.Errorf("SOCKS4 CONNECT bị từ chối (mã 0x%02x)", response[1])
	}
	return nil
}

func (p proxyConfig) connectSOCKS5(conn net.Conn, targetAddr string) error {
	methods := []byte{0x00} // no authentication
	useAuth := p.username != "" || p.password != ""
	if useAuth {
		if len(p.username) > 255 || len(p.password) > 255 {
			return errors.New("SOCKS5 username/password tối đa 255 bytes")
		}
		methods = append(methods, 0x02)
	}
	if _, err := conn.Write(append([]byte{5, byte(len(methods))}, methods...)); err != nil {
		return err
	}

	methodResponse := make([]byte, 2)
	if _, err := io.ReadFull(conn, methodResponse); err != nil {
		return err
	}
	if methodResponse[0] != 5 || methodResponse[1] == 0xff {
		return errors.New("SOCKS5 không chấp nhận phương thức xác thực")
	}
	if methodResponse[1] == 0x02 {
		if !useAuth {
			return errors.New("SOCKS5 yêu cầu xác thực")
		}
		auth := make([]byte, 0, 3+len(p.username)+len(p.password))
		auth = append(auth, 1, byte(len(p.username)))
		auth = append(auth, p.username...)
		auth = append(auth, byte(len(p.password)))
		auth = append(auth, p.password...)
		if _, err := conn.Write(auth); err != nil {
			return err
		}
		if _, err := io.ReadFull(conn, methodResponse); err != nil {
			return err
		}
		if methodResponse[0] != 1 || methodResponse[1] != 0 {
			return errors.New("SOCKS5 xác thực thất bại")
		}
	} else if methodResponse[1] != 0x00 {
		return fmt.Errorf("SOCKS5 chọn phương thức không hỗ trợ: 0x%02x", methodResponse[1])
	}

	host, portText, err := net.SplitHostPort(targetAddr)
	if err != nil {
		return err
	}
	port, err := strconv.ParseUint(portText, 10, 16)
	if err != nil || port == 0 {
		return fmt.Errorf("cổng đích không hợp lệ: %q", portText)
	}

	request := []byte{5, 1, 0}
	if ip := net.ParseIP(host); ip != nil {
		if ipv4 := ip.To4(); ipv4 != nil {
			request = append(request, 1)
			request = append(request, ipv4...)
		} else {
			request = append(request, 4)
			request = append(request, ip.To16()...)
		}
	} else {
		if len(host) == 0 || len(host) > 255 {
			return errors.New("hostname SOCKS5 không hợp lệ")
		}
		request = append(request, 3, byte(len(host)))
		request = append(request, host...)
	}
	request = append(request, byte(port>>8), byte(port))
	if _, err := conn.Write(request); err != nil {
		return err
	}

	connectResponse := make([]byte, 4)
	if _, err := io.ReadFull(conn, connectResponse); err != nil {
		return err
	}
	if connectResponse[0] != 5 || connectResponse[1] != 0 {
		return fmt.Errorf("SOCKS5 CONNECT bị từ chối (mã 0x%02x)", connectResponse[1])
	}
	return discardSOCKS5Address(conn, connectResponse[3])
}

func discardSOCKS5Address(conn io.Reader, addressType byte) error {
	length := 0
	switch addressType {
	case 1:
		length = net.IPv4len
	case 4:
		length = net.IPv6len
	case 3:
		var size [1]byte
		if _, err := io.ReadFull(conn, size[:]); err != nil {
			return err
		}
		length = int(size[0])
	default:
		return fmt.Errorf("SOCKS5 trả về address type không hợp lệ: 0x%02x", addressType)
	}
	_, err := io.CopyN(io.Discard, conn, int64(length+2)) // địa chỉ bind + cổng bind
	return err
}

func dialTLSViaProxy(ctx context.Context, p proxyConfig, targetAddr string, timeout time.Duration, tlsConfig *tls.Config) (net.Conn, error) {
	conn, err := p.dial(ctx, targetAddr, timeout)
	if err != nil {
		return nil, err
	}

	host, _, err := net.SplitHostPort(targetAddr)
	if err != nil {
		conn.Close()
		return nil, err
	}
	config := &tls.Config{ServerName: host, NextProtos: []string{"h2"}}
	if tlsConfig != nil {
		config = tlsConfig.Clone()
		if config.ServerName == "" {
			config.ServerName = host
		}
		if len(config.NextProtos) == 0 {
			config.NextProtos = []string{"h2"}
		}
	}

	tlsConn := tls.Client(conn, config)
	if err := tlsConn.HandshakeContext(ctx); err != nil {
		tlsConn.Close()
		return nil, fmt.Errorf("TLS: %w", err)
	}
	if tlsConn.ConnectionState().NegotiatedProtocol != "h2" {
		tlsConn.Close()
		return nil, fmt.Errorf("server không hỗ trợ HTTP/2 (ALPN: %q)", tlsConn.ConnectionState().NegotiatedProtocol)
	}
	if err := tlsConn.SetDeadline(time.Time{}); err != nil {
		tlsConn.Close()
		return nil, err
	}
	return tlsConn, nil
}

func buildH2Client(proxyAddr string, timeout time.Duration) (*http.Client, error) {
	p, err := parseProxy(proxyAddr)
	if err != nil {
		return nil, err
	}

	transport := &http2.Transport{
		DialTLSContext: func(ctx context.Context, network, addr string, config *tls.Config) (net.Conn, error) {
			if network != "tcp" {
				return nil, fmt.Errorf("network không hỗ trợ: %s", network)
			}
			return dialTLSViaProxy(ctx, p, addr, timeout, config)
		},
	}
	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}

type Result struct {
	proxy   string
	alive   bool
	latency time.Duration
	title   string
}

func responseTitle(resp *http.Response) string {
	defer resp.Body.Close()
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/html") {
		return ""
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 16*1024))
	if err != nil {
		return ""
	}
	match := titleRE.FindSubmatch(body)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(string(match[1]))
}

func checkProxy(proxyAddr, judgeURL string, timeout time.Duration, retries int) Result {
	client, err := buildH2Client(proxyAddr, timeout)
	if err != nil {
		return Result{proxy: proxyAddr}
	}
	defer client.CloseIdleConnections()

	for attempt := 0; attempt < retries; attempt++ {
		start := time.Now()
		resp, err := client.Get(judgeURL)
		if err == nil {
			latency := time.Since(start)
			if resp.StatusCode >= 200 && resp.StatusCode < 400 {
				return Result{proxy: proxyAddr, alive: true, latency: latency, title: responseTitle(resp)}
			}
			resp.Body.Close()
		}
		if attempt+1 < retries {
			time.Sleep(300 * time.Millisecond)
		}
	}
	return Result{proxy: proxyAddr}
}

func readLines(filename string) ([]string, error) {
	f, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			lines = append(lines, line)
		}
	}
	return lines, scanner.Err()
}

func validateJudgeURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return err
	}
	if u.Scheme != "https" || u.Hostname() == "" {
		return errors.New("judge URL phải là một HTTPS URL hợp lệ")
	}
	return nil
}

func main() {
	inputFile := flag.String("input", "", "File proxy đầu vào (mỗi dòng một proxy)")
	outFile := flag.String("output", "", "File lưu proxy sống")
	judgeURL := flag.String("url", defaultJudge, "Judge HTTPS URL")
	toSec := flag.Int("timeout", 10, "Timeout mỗi lần thử (giây)")
	retries := flag.Int("retries", 3, "Số lần retry mỗi proxy")
	workers := flag.Int("workers", 30, "Số goroutine song song")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `CF-H2 Proxy Checker – kiểm tra HTTP/2 qua HTTP, SOCKS4 và SOCKS5

Usage:
  %s -input <proxies.txt> -output <working.txt> [options]

Options:
`, os.Args[0])
		flag.PrintDefaults()
		fmt.Fprintln(os.Stderr, `
Proxy file format (mỗi dòng):
  1.2.3.4:8080
  http://user:pass@1.2.3.4:8080
  socks4://1.2.3.4:1080
  socks5://user:pass@1.2.3.4:1080`)
	}
	flag.Parse()

	if *inputFile == "" || *outFile == "" {
		fmt.Fprintln(os.Stderr, "Lỗi: -input và -output là bắt buộc.")
		flag.Usage()
		os.Exit(1)
	}
	if *toSec <= 0 || *retries <= 0 || *workers <= 0 {
		fmt.Fprintln(os.Stderr, "Lỗi: -timeout, -retries và -workers phải lớn hơn 0.")
		os.Exit(1)
	}
	if err := validateJudgeURL(*judgeURL); err != nil {
		fmt.Fprintf(os.Stderr, "Lỗi judge URL: %v\n", err)
		os.Exit(1)
	}

	proxies, err := readLines(*inputFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Không đọc được input: %v\n", err)
		os.Exit(1)
	}
	if len(proxies) == 0 {
		fmt.Fprintln(os.Stderr, "Không có proxy nào trong file.")
		os.Exit(1)
	}

	out, err := os.Create(*outFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Không tạo được output: %v\n", err)
		os.Exit(1)
	}
	defer out.Close()
	bw := bufio.NewWriter(out)
	defer bw.Flush()

	timeout := time.Duration(*toSec) * time.Second
	total := len(proxies)
	if *workers > total {
		*workers = total
	}

	fmt.Printf("┌──────────────────────────────────────────┐\n")
	fmt.Printf("│  CF-H2 Proxy Checker                     │\n")
	fmt.Printf("├──────────────────────────────────────────┤\n")
	fmt.Printf("│  Judge   : %-29s│\n", *judgeURL)
	fmt.Printf("│  Proxies : %-29d│\n", total)
	fmt.Printf("│  Timeout : %-29s│\n", fmt.Sprintf("%ds", *toSec))
	fmt.Printf("│  Retries : %-29d│\n", *retries)
	fmt.Printf("│  Workers : %-29d│\n", *workers)
	fmt.Printf("└──────────────────────────────────────────┘\n\n")

	jobs := make(chan string)
	results := make(chan Result)
	var wg sync.WaitGroup
	for range *workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for proxy := range jobs {
				results <- checkProxy(proxy, *judgeURL, timeout, *retries)
			}
		}()
	}
	go func() {
		for _, proxy := range proxies {
			jobs <- proxy
		}
		close(jobs)
		wg.Wait()
		close(results)
	}()

	checked, working := 0, 0
	for result := range results {
		checked++
		if result.alive {
			working++
			fmt.Fprintln(bw, result.proxy)
			title := ""
			if result.title != "" {
				title = fmt.Sprintf(" [%s]", result.title)
			}
			fmt.Printf("[%d/%d] ✓ LIVE  %6dms  %s%s\n", checked, total, result.latency.Milliseconds(), result.proxy, title)
		} else {
			fmt.Printf("[%d/%d] ✗ DEAD            %s\n", checked, total, result.proxy)
		}
	}

	fmt.Printf("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	fmt.Printf("Tổng  : %d\n", total)
	fmt.Printf("Sống  : %d (%.1f%%)\n", working, float64(working)/float64(total)*100)
	fmt.Printf("Chết  : %d\n", total-working)
	fmt.Printf("Output: %s\n", *outFile)
}
