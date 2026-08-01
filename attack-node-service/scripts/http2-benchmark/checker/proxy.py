# -*- coding: utf-8 -*-
# Suny - PROXY HUNTER v32.0 - Chỉ 1 file duy nhất

import os, sys, time, re, json, requests, threading, random
from concurrent.futures import ThreadPoolExecutor, as_completed, wait, FIRST_COMPLETED
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
from collections import Counter
from urllib.parse import urlparse
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

# ==================== KIỂM TRA NỀN TẢNG ====================
PLATFORM = sys.platform
if 'win' in PLATFORM:
    OS_NAME = 'Windows'
elif 'android' in PLATFORM:
    OS_NAME = 'Android (Termux)'
elif 'darwin' in PLATFORM:
    OS_NAME = 'macOS'
elif 'linux' in PLATFORM:
    OS_NAME = 'Linux'
elif 'iphone' in PLATFORM or 'ios' in PLATFORM:
    OS_NAME = 'iOS'
else:
    OS_NAME = 'Unknown'

# ==================== CẤU HÌNH ====================
CONFIG_FILE = "config.json"
CUSTOM_SOURCES_FILE = "sources_custom.json"

DEFAULT_CONFIG = {
    "raw_file": "proxies_raw.txt",
    "alive_file": "proxies_alive.txt",      # File duy nhất chứa proxy sống + thông tin
    "elite_file": "proxies_elite.txt",
    "http_file": "proxies_http.txt",
    "socks4_file": "proxies_socks4.txt",
    "socks5_file": "proxies_socks5.txt",
    "threads_fetch": 20,
    "threads_check": 150,
    "threads_enrich": 40,
    "timeout_fetch": 15,
    "timeout_check": 3,          # read timeout Phase 1
    "timeout_connect": 1.5,      # connect chết nhanh → không chờ đủ read
    "max_latency": 5.0,
    "check_timeout_total": 5,
    "country_timeout": 2,
    "batch_size": 500,
    "speed_test": False,
    "max_latency_ms": 3000,
    "max_latency_check_ms": 2000,
    "check_rounds": 2,
    "min_success_rate": 0.7,
    "probe_https": True,
    "probe_socks": True,
    "probe_url": "http://api.ipify.org/?format=json",
    "max_proxies_per_source": 15000,  # nguồn dump > ngưỡng → bỏ (tránh 100k rác)
    "language": "vi"
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                cfg = json.load(f)
                for k, v in DEFAULT_CONFIG.items():
                    if k not in cfg:
                        cfg[k] = v
                return cfg
        except:
            pass
    return DEFAULT_CONFIG.copy()

def save_config(cfg):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=4)

config = load_config()

# SOCKS cần PySocks (pip install pysocks)
try:
    import socks  # noqa: F401
    HAS_SOCKS = True
except ImportError:
    HAS_SOCKS = False

# ==================== MÀU SẮC ====================
R = '\033[0m'
BOLD = '\033[1m'
DIM = '\033[2m'
GOLD = '\033[38;5;214m'
CYAN = '\033[96m'
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
MAGENTA = '\033[95m'
WHITE = '\033[97m'

# ==================== ĐA NGÔN NGỮ ====================
TEXT = {
    "vi": {
        "title": f"PROXY HUNTER v32.0 - {OS_NAME}",
        "scraping": "THU THẬP",
        "checking": "KIỂM TRA SỐNG",
        "alive": "Sống",
        "removed": "Loại",
        "error": "Lỗi",
        "elite": "Elite",
        "anonymous": "Ẩn danh",
        "transparent": "Công khai",
        "country_stats": "THỐNG KÊ THEO QUỐC GIA",
        "protocols": "Giao thức",
        "stability": "Ổn định",
        "latency": "Độ trễ",
        "config": "CẤU HÌNH",
        "menu": "MENU CHÍNH",
        "exit": "Thoát",
        "start": "Bắt đầu",
        "end": "Kết thúc",
        "total_time": "Tổng thời gian"
    },
    "en": {
        "title": f"PROXY HUNTER v32.0 - {OS_NAME}",
        "scraping": "SCRAPING",
        "checking": "CHECKING ALIVE",
        "alive": "Alive",
        "removed": "Removed",
        "error": "Errors",
        "elite": "Elite",
        "anonymous": "Anonymous",
        "transparent": "Transparent",
        "country_stats": "COUNTRY STATS",
        "protocols": "Protocols",
        "stability": "Stability",
        "latency": "Latency",
        "config": "CONFIG",
        "menu": "MAIN MENU",
        "exit": "Exit",
        "start": "Start",
        "end": "End",
        "total_time": "Total time"
    }
}

def _(key):
    lang = config.get("language", "vi")
    return TEXT.get(lang, TEXT["vi"]).get(key, key)

# ==================== MÚI GIỜ ====================
VN_TZ = timezone(timedelta(hours=7))
def vn_time():
    return datetime.now(VN_TZ).strftime('%H:%M:%S')
def vn_datetime():
    return datetime.now(VN_TZ).strftime('%Y-%m-%d %H:%M:%S')

# ==================== NGUỒN PROXY ====================
PROXY_SOURCES = [
    {'name': 'SpeedX-HTTP', 'url': 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', 'type': 'text'},
    {'name': 'SpeedX-SOCKS4', 'url': 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt', 'type': 'text'},
    {'name': 'SpeedX-SOCKS5', 'url': 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt', 'type': 'text'},
    {'name': 'ShiftyTR-HTTP', 'url': 'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt', 'type': 'text'},
    {'name': 'ShiftyTR-SOCKS4', 'url': 'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt', 'type': 'text'},
    {'name': 'ShiftyTR-SOCKS5', 'url': 'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt', 'type': 'text'},
    {'name': 'ShiftyTR-All', 'url': 'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/proxy.txt', 'type': 'text'},
    {'name': 'Monosans-All', 'url': 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/all.txt', 'type': 'text'},
    {'name': 'Monosans-HTTP', 'url': 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', 'type': 'text'},
    {'name': 'Monosans-SOCKS4', 'url': 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt', 'type': 'text'},
    {'name': 'Monosans-SOCKS5', 'url': 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt', 'type': 'text'},
    {'name': 'Roosterkid-HTTP', 'url': 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt', 'type': 'text'},
    {'name': 'Roosterkid-SOCKS4', 'url': 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt', 'type': 'text'},
    {'name': 'Roosterkid-SOCKS5', 'url': 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt', 'type': 'text'},
    {'name': 'Almroot-All', 'url': 'https://raw.githubusercontent.com/almroot/proxylist/master/list.txt', 'type': 'text'},
    {'name': 'Hookzof-SOCKS5', 'url': 'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt', 'type': 'text'},
    {'name': 'Jetkai-HTTP', 'url': 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt', 'type': 'text'},
    {'name': 'Jetkai-SOCKS4', 'url': 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt', 'type': 'text'},
    {'name': 'Jetkai-SOCKS5', 'url': 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt', 'type': 'text'},
    {'name': 'ProxyScrape-Elite', 'url': 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=elite', 'type': 'text'},
    {'name': 'ProxyScrape-HTTP', 'url': 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=anonymous', 'type': 'text'},
    {'name': 'ProxyScrape-SOCKS4', 'url': 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all', 'type': 'text'},
    {'name': 'ProxyScrape-SOCKS5', 'url': 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all', 'type': 'text'},
    {'name': 'SSLProxies', 'url': 'https://www.sslproxies.org/', 'type': 'html_table'},
    {'name': 'FreeProxyList', 'url': 'https://free-proxy-list.net/', 'type': 'html_table'},
    {'name': 'USProxy', 'url': 'https://www.us-proxy.org/', 'type': 'html_table'},
    {'name': 'SocksProxy', 'url': 'https://www.socks-proxy.net/', 'type': 'html_table'},
    {'name': 'Zevtyardt-HTTP', 'url': 'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/http.txt', 'type': 'text'},
    {'name': 'Zevtyardt-SOCKS4', 'url': 'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/socks4.txt', 'type': 'text'},
    {'name': 'Zevtyardt-SOCKS5', 'url': 'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/socks5.txt', 'type': 'text'},
    {'name': 'Opsxcq-All', 'url': 'https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt', 'type': 'text'},
    {'name': 'Clarketm-All', 'url': 'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt', 'type': 'text'},
    # mauricegift/free-proxies — https://github.com/mauricegift/free-proxies/tree/master/files
    {'name': 'Gift-HTTP', 'url': 'https://raw.githubusercontent.com/mauricegift/free-proxies/master/files/http.json', 'type': 'json'},
    {'name': 'Gift-SOCKS4', 'url': 'https://raw.githubusercontent.com/mauricegift/free-proxies/master/files/socks4.json', 'type': 'json'},
    {'name': 'Gift-SOCKS5', 'url': 'https://raw.githubusercontent.com/mauricegift/free-proxies/master/files/socks5.json', 'type': 'json'},
    {'name': 'Gift-All', 'url': 'https://raw.githubusercontent.com/mauricegift/free-proxies/master/files/proxies.json', 'type': 'json'},
    {'name': 'ProxyMirror-All', 'url': 'https://raw.githubusercontent.com/traceybean-1990/proxy-mirror/main/proxy.txt', 'type': 'text'},
    # hproxy-com/free-proxy-list — https://github.com/hproxy-com/free-proxy-list
    {'name': 'HProxy-All', 'url': 'https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/all.txt', 'type': 'text'},
    {'name': 'HProxy-HTTP', 'url': 'https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/http.txt', 'type': 'text'},
    {'name': 'HProxy-HTTPS', 'url': 'https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/https.txt', 'type': 'text'},
    {'name': 'HProxy-SOCKS4', 'url': 'https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/socks4.txt', 'type': 'text'},
    {'name': 'HProxy-SOCKS5', 'url': 'https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/socks5.txt', 'type': 'text'},
    {'name': 'ProxyWorld-All', 'url': 'https://raw.githubusercontent.com/themiralay/Proxy-List-World/master/data.txt', 'type': 'text'},
    # ebrasha/abdal-proxy-hub — https://github.com/ebrasha/abdal-proxy-hub
    {'name': 'Abdal-HTTP', 'url': 'https://raw.githubusercontent.com/ebrasha/abdal-proxy-hub/main/http-proxy-list-by-EbraSha.txt', 'type': 'text'},
    {'name': 'Abdal-HTTPS', 'url': 'https://raw.githubusercontent.com/ebrasha/abdal-proxy-hub/main/https-proxy-list-by-EbraSha.txt', 'type': 'text'},
    {'name': 'Abdal-SOCKS4', 'url': 'https://raw.githubusercontent.com/ebrasha/abdal-proxy-hub/main/socks4-proxy-list-by-EbraSha.txt', 'type': 'text'},
    {'name': 'Abdal-SOCKS5', 'url': 'https://raw.githubusercontent.com/ebrasha/abdal-proxy-hub/main/socks5-proxy-list-by-EbraSha.txt', 'type': 'text'},
    # zloi-user/hideip.me — https://github.com/zloi-user/hideip.me (ip:port:Country)
    {'name': 'HideIP-HTTP', 'url': 'https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt', 'type': 'text'},
    {'name': 'HideIP-HTTPS', 'url': 'https://raw.githubusercontent.com/zloi-user/hideip.me/main/https.txt', 'type': 'text'},
    {'name': 'HideIP-SOCKS4', 'url': 'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt', 'type': 'text'},
    {'name': 'HideIP-SOCKS5', 'url': 'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt', 'type': 'text'},
    {'name': 'HideIP-CONNECT', 'url': 'https://raw.githubusercontent.com/zloi-user/hideip.me/main/connect.txt', 'type': 'text'},
    # --- auto-found from GitHub "proxy list" (recently updated) ---
    {'name': 'DataBay-HTTP', 'url': 'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/http.txt', 'type': 'text'},
    {'name': 'DataBay-SOCKS4', 'url': 'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks4.txt', 'type': 'text'},
    {'name': 'DataBay-SOCKS5', 'url': 'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks5.txt', 'type': 'text'},
    {'name': 'Stormsia-HTTP', 'url': 'https://raw.githubusercontent.com/stormsia/proxy-list/main/http.txt', 'type': 'text'},
    {'name': 'Stormsia-SOCKS4', 'url': 'https://raw.githubusercontent.com/stormsia/proxy-list/main/socks4.txt', 'type': 'text'},
    {'name': 'Stormsia-SOCKS5', 'url': 'https://raw.githubusercontent.com/stormsia/proxy-list/main/socks5.txt', 'type': 'text'},
    {'name': 'Stormsia-Working', 'url': 'https://raw.githubusercontent.com/stormsia/proxy-list/main/working_proxies.txt', 'type': 'text'},
    {'name': 'VPSLab-All', 'url': 'https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/all_proxies.txt', 'type': 'text'},
    {'name': 'VPSLab-HTTP', 'url': 'https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/http_all.txt', 'type': 'text'},
    {'name': 'VPSLab-SOCKS4', 'url': 'https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks4_all.txt', 'type': 'text'},
    {'name': 'VPSLab-SOCKS5', 'url': 'https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt', 'type': 'text'},
    {'name': 'VPSLab-Elite', 'url': 'https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/all_elite.txt', 'type': 'text'},
    {'name': 'Prxchk-All', 'url': 'https://raw.githubusercontent.com/prxchk/proxy-list/main/all.txt', 'type': 'text'},
    {'name': 'Prxchk-HTTP', 'url': 'https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt', 'type': 'text'},
    {'name': 'Prxchk-SOCKS4', 'url': 'https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt', 'type': 'text'},
    {'name': 'Prxchk-SOCKS5', 'url': 'https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt', 'type': 'text'},
    # MuRong bỏ: mỗi file ~90–100k, SOCKS5 lẫn port 80/8080 → phình list vô nghĩa
    {'name': 'Sunny9577-All', 'url': 'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt', 'type': 'text'},
    {'name': 'Rdavydov-HTTP', 'url': 'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt', 'type': 'text'},
    {'name': 'Rdavydov-SOCKS4', 'url': 'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks4.txt', 'type': 'text'},
    {'name': 'Rdavydov-SOCKS5', 'url': 'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks5.txt', 'type': 'text'},
    {'name': 'ProxyScrapeGH-All', 'url': 'https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/all/data.txt', 'type': 'text'},
    {'name': 'ProxyScrapeGH-HTTP', 'url': 'https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/http/data.txt', 'type': 'text'},
    {'name': 'ProxyScrapeGH-HTTPS', 'url': 'https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/https/data.txt', 'type': 'text'},
    {'name': 'ProxyScrapeGH-SOCKS4', 'url': 'https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/socks4/data.txt', 'type': 'text'},
    {'name': 'ProxyScrapeGH-SOCKS5', 'url': 'https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/socks5/data.txt', 'type': 'text'},
    {'name': 'Proxifly-All', 'url': 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt', 'type': 'text'},
    {'name': 'Proxifly-HTTP', 'url': 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt', 'type': 'text'},
    {'name': 'Proxifly-HTTPS', 'url': 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/https/data.txt', 'type': 'text'},
    {'name': 'Proxifly-SOCKS4', 'url': 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt', 'type': 'text'},
    {'name': 'Proxifly-SOCKS5', 'url': 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt', 'type': 'text'},
    {'name': 'ObcbO-HTTP', 'url': 'https://raw.githubusercontent.com/ObcbO/getproxy/master/file/http.txt', 'type': 'text'},
    {'name': 'ObcbO-All', 'url': 'https://raw.githubusercontent.com/ObcbO/getproxy/master/file/all.txt', 'type': 'text'},
    {'name': 'AnonWork-HTTP', 'url': 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/http_proxies.txt', 'type': 'text'},
    {'name': 'AnonWork-SOCKS4', 'url': 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks4_proxies.txt', 'type': 'text'},
    {'name': 'AnonWork-SOCKS5', 'url': 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks5_proxies.txt', 'type': 'text'},
]

AUTH_SOURCES = []

def source_proto(source):
    """Suy ra protocol từ tên nguồn: http | socks4 | socks5 | all."""
    if source.get('proto'):
        return source['proto']
    name = source.get('name', '').upper()
    if 'SOCKS5' in name:
        return 'socks5'
    if 'SOCKS4' in name:
        return 'socks4'
    if re.search(r'\bSOCKS\b', name) and 'SOCKS4' not in name and 'SOCKS5' not in name:
        return 'socks5'
    if any(k in name for k in ('HTTPS', 'HTTP', 'SSL', 'CONNECT')):
        return 'http'
    if 'ELITE' in name and 'PROXYSCRAPE' in name:
        return 'http'
    return 'all'

def merge_proto_hint(old, new):
    """Gộp hint khi cùng ip:port xuất hiện ở nhiều nguồn."""
    if not old:
        return new
    if not new or old == new:
        return old
    if old == 'all' or new == 'all':
        return 'all'
    return 'all'  # http + socks* → phải thử cả

def filter_sources_by_proto(sources, proto='all'):
    """Lọc nguồn theo loại: http | socks4 | socks5 | all."""
    proto = (proto or 'all').lower()
    if proto == 'all':
        return list(sources)
    return [s for s in sources if source_proto(s) == proto]

def count_sources_by_proto(sources):
    c = Counter(source_proto(s) for s in sources)
    return {
        'http': c.get('http', 0),
        'socks4': c.get('socks4', 0),
        'socks5': c.get('socks5', 0),
        'all': c.get('all', 0),
        'total': len(sources),
    }

def ask_proto_filter(sources=None):
    """Hỏi loại proxy muốn lấy (theo nguồn). Enter = tất cả."""
    sources = sources if sources is not None else (PROXY_SOURCES + load_custom_sources())
    counts = count_sources_by_proto(sources)
    print(f"\n{BOLD}{GOLD}  🎯  CHỌN LOẠI PROXY (theo nguồn){R}")
    print(f"{DIM}  ┌{'─' * 48}┐{R}")
    print(f"  │ {GREEN}[1]{R}  HTTP / HTTPS     {WHITE}{counts['http']:>4}{R} nguồn")
    print(f"  │ {YELLOW}[2]{R}  SOCKS4           {WHITE}{counts['socks4']:>4}{R} nguồn")
    print(f"  │ {CYAN}[3]{R}  SOCKS5           {WHITE}{counts['socks5']:>4}{R} nguồn")
    print(f"  │ {MAGENTA}[4]{R}  Tất cả           {WHITE}{counts['total']:>4}{R} nguồn  {DIM}(+{counts['all']} mixed){R}")
    print(f"{DIM}  └{'─' * 48}┘{R}")
    print(f"  {DIM}(Enter = tất cả){R}")
    choice = input(f"{BOLD}{YELLOW}  → {R}").strip().lower()
    mapping = {
        '1': 'http', 'http': 'http', 'https': 'http',
        '2': 'socks4', 'socks4': 'socks4', 's4': 'socks4',
        '3': 'socks5', 'socks5': 'socks5', 's5': 'socks5',
        '4': 'all', 'all': 'all', '': 'all',
    }
    proto = mapping.get(choice)
    if proto is None:
        print(f"{YELLOW}  ⚠️  Không hợp lệ → dùng Tất cả{R}")
        proto = 'all'
    label = {'http': 'HTTP/HTTPS', 'socks4': 'SOCKS4', 'socks5': 'SOCKS5', 'all': 'Tất cả'}[proto]
    filtered = filter_sources_by_proto(sources, proto)
    print(f"{GREEN}  ✅  Đã chọn: {WHITE}{label}{GREEN} → {WHITE}{len(filtered)}{GREEN} nguồn{R}")
    return proto, filtered

def load_custom_sources():
    if os.path.exists(CUSTOM_SOURCES_FILE):
        try:
            with open(CUSTOM_SOURCES_FILE, 'r') as f:
                data = json.load(f)
                return data.get("sources", [])
        except:
            pass
    return []

# ==================== HÀM CLEAR MÀN HÌNH ====================
def clear():
    os.system('cls' if os.name == 'nt' else 'clear')

def extract_proxy(line):
    """Lấy ip:port (hoặc ip:port:user:pass) từ dòng thô hoặc dòng chi tiết alive."""
    line = line.strip()
    if not line or line.startswith('#'):
        return None
    # Format alive: "ip:port | country | flag | ..."
    if '|' in line:
        line = line.split('|', 1)[0].strip()
    parts = line.split(':')
    if len(parts) >= 2 and parts[1].strip().isdigit():
        if len(parts) == 4:
            return f"{parts[0].strip()}:{parts[1].strip()}:{parts[2].strip()}:{parts[3].strip()}"
        return f"{parts[0].strip()}:{parts[1].strip()}"
    return None

def load_proxies_from_file(path):
    proxies = []
    seen = set()
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            proxy = extract_proxy(line)
            if proxy and proxy not in seen:
                seen.add(proxy)
                proxies.append(proxy)
    return proxies

# ==================== PROXY HUNTER CLASS ====================
class ProxyHunter:
    def __init__(self, cfg=config):
        self.cfg = cfg
        self.proxies = set()
        self.auth_proxies = set()
        self.proxy_hints = {}  # proxy -> http|socks4|socks5|all
        self.elite_proxies = set()
        self.lock = threading.Lock()
        self.start_time = time.time()
        self.country_cache = {}
        self.country_lock = threading.Lock()
        self.alive_with_details = []
        self.removed_slow = 0
        self.anonymity_cache = {}
        self.anonymity_lock = threading.Lock()
        self._local = threading.local()
        self.save_lock = threading.Lock()
        self._alive_fp = None
        self._elite_fp = None

    def begin_alive_file(self):
        """Mở file sống mới (ghi đè) + header; elite cũng reset."""
        path = os.path.abspath(self.cfg['alive_file'])
        elite_path = os.path.abspath(self.cfg['elite_file'])
        with self.save_lock:
            if self._alive_fp:
                try:
                    self._alive_fp.close()
                except Exception:
                    pass
            self._alive_fp = open(path, 'w', encoding='utf-8', buffering=1)
            self._alive_fp.write("# Proxy | Country | Flag | Latency(ms) | Anonymity | Protocols | Stability\n")
            self._alive_fp.flush()
            try:
                os.fsync(self._alive_fp.fileno())
            except Exception:
                pass

            if self._elite_fp:
                try:
                    self._elite_fp.close()
                except Exception:
                    pass
            self._elite_fp = open(elite_path, 'w', encoding='utf-8', buffering=1)
            self._elite_fp.flush()
        print(f"{DIM}  💾  Lưu dần → {path}{R}")

    def append_alive_item(self, item):
        """Ghi ngay 1 proxy sống + flush."""
        line = (f"{item['proxy']} | {item['country']} | {item['flag']} | {item['latency']} | "
                f"{item['anonymity']} | {item['protocols']} | {item['stability']}\n")
        with self.save_lock:
            if self._alive_fp is None:
                path = os.path.abspath(self.cfg['alive_file'])
                self._alive_fp = open(path, 'a', encoding='utf-8', buffering=1)
            self._alive_fp.write(line)
            self._alive_fp.flush()
            try:
                os.fsync(self._alive_fp.fileno())
            except Exception:
                pass

    def rewrite_alive_file(self, items):
        """Ghi đè toàn bộ file bằng danh sách đã enrich (giữ handle mở)."""
        path = os.path.abspath(self.cfg['alive_file'])
        with self.save_lock:
            if self._alive_fp:
                try:
                    self._alive_fp.close()
                except Exception:
                    pass
            self._alive_fp = open(path, 'w', encoding='utf-8', buffering=1)
            self._alive_fp.write("# Proxy | Country | Flag | Latency(ms) | Anonymity | Protocols | Stability\n")
            for item in items:
                self._alive_fp.write(
                    f"{item['proxy']} | {item['country']} | {item['flag']} | {item['latency']} | "
                    f"{item['anonymity']} | {item['protocols']} | {item['stability']}\n"
                )
            self._alive_fp.flush()
            try:
                os.fsync(self._alive_fp.fileno())
            except Exception:
                pass

    def append_elite(self, proxy):
        with self.save_lock:
            if self._elite_fp is None:
                self._elite_fp = open(os.path.abspath(self.cfg['elite_file']), 'a', encoding='utf-8', buffering=1)
            self._elite_fp.write(f"{proxy}\n")
            self._elite_fp.flush()

    def close_save_files(self):
        with self.save_lock:
            for fp in (self._alive_fp, self._elite_fp):
                if fp:
                    try:
                        fp.flush()
                        os.fsync(fp.fileno())
                        fp.close()
                    except Exception:
                        pass
            self._alive_fp = None
            self._elite_fp = None

    def _thread_session(self):
        session = getattr(self._local, 'session', None)
        if session is None:
            session = requests.Session()
            session.verify = False
            session.headers.update({'Connection': 'close', 'User-Agent': 'Mozilla/5.0'})
            adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=0)
            session.mount('http://', adapter)
            session.mount('https://', adapter)
            self._local.session = session
        return session

    @staticmethod
    def proxy_url(proxy, scheme='http'):
        """Build proxy URL. scheme: http | socks4 | socks5"""
        parts = proxy.split(':')
        if len(parts) == 4:
            ip, port, user, pw = parts
            return f"{scheme}://{user}:{pw}@{ip}:{port}"
        return f"{scheme}://{parts[0]}:{parts[1]}"

    def _probe_timeout(self):
        """(connect, read) — proxy chết fail ở connect, không chờ hết read."""
        connect = float(self.cfg.get('timeout_connect', 1.5))
        read = float(self.cfg.get('timeout_check', 3))
        return (connect, read)

    def _probe_via(self, proxy, scheme, path='ip', timeout=None):
        """GET probe URL via proxy. Returns (ok, latency_ms, response_or_None)."""
        if timeout is None:
            timeout = self._probe_timeout()
        p_url = self.proxy_url(proxy, scheme)
        proxies = {'http': p_url, 'https': p_url}
        # Phase 1: endpoint nhẹ (ipify). path=headers → httpbin (enrich anonymity)
        if path == 'headers':
            url = 'http://httpbin.org/headers'
        else:
            url = self.cfg.get('probe_url') or 'http://api.ipify.org/?format=json'
        start = time.perf_counter()
        try:
            r = self._thread_session().get(
                url, proxies=proxies, timeout=timeout,
                allow_redirects=False, verify=False
            )
            lat = (time.perf_counter() - start) * 1000
            if r.status_code == 200 and lat / 1000 < self.cfg['max_latency']:
                return True, round(lat), r
        except Exception:
            pass
        return False, None, None

    def check_proxy_fast(self, proxy, hint='all'):
        """Phase 1: chỉ cần sống — probe /ip nhẹ, anonymity để Phase 2."""
        for scheme in self.schemes_for_hint(hint):
            ok, lat, _resp = self._probe_via(proxy, scheme, path='ip')
            if not ok:
                continue
            anonymity = 'SOCKS' if scheme.startswith('socks') else 'Unknown'
            primary = 'HTTP' if scheme == 'http' else scheme.upper()
            return (proxy, lat, anonymity, primary)
        return None

    def country_flag(self, country_code):
        if not country_code or len(country_code) != 2:
            return '🌍'
        return ''.join(chr(ord(c) + 0x1F1E6 - ord('A')) for c in country_code.upper())

    def get_country(self, ip):
        with self.country_lock:
            if ip in self.country_cache:
                return self.country_cache[ip]
        try:
            r = self._thread_session().get(
                f"http://ip-api.com/json/{ip}?fields=status,countryCode",
                timeout=self.cfg['country_timeout']
            )
            if r.status_code == 200:
                data = r.json()
                if data.get('status') == 'success':
                    country = data.get('countryCode', '??')
                    with self.country_lock:
                        self.country_cache[ip] = country
                    return country
        except Exception:
            pass
        with self.country_lock:
            self.country_cache[ip] = '??'
        return '??'

    def prefetch_countries(self, ips):
        """Batch lookup country codes (ip-api: max 100/request)."""
        unique = []
        with self.country_lock:
            for ip in ips:
                if ip not in self.country_cache:
                    unique.append(ip)
        if not unique:
            return
        for i in range(0, len(unique), 100):
            batch = unique[i:i + 100]
            try:
                r = requests.post(
                    'http://ip-api.com/batch?fields=status,query,countryCode',
                    json=batch,
                    timeout=max(5, self.cfg['country_timeout'] * 3)
                )
                if r.status_code != 200:
                    continue
                with self.country_lock:
                    for item in r.json():
                        if item.get('status') == 'success':
                            self.country_cache[item['query']] = item.get('countryCode', '??')
                        else:
                            q = item.get('query')
                            if q:
                                self.country_cache[q] = '??'
            except Exception:
                pass

    def classify_anonymity(self, headers):
        forwarded = headers.get('X-Forwarded-For', '')
        via = headers.get('Via', '')
        if not forwarded and not via:
            return 'Elite'
        if forwarded and not via:
            return 'Anonymous'
        return 'Transparent'

    def check_protocols(self, proxy, known=None):
        """Probe HTTP / HTTPS / SOCKS4 / SOCKS5. known = schemes already confirmed."""
        supported = list(known) if known else []
        timeout = min(self.cfg['timeout_check'], 3)

        def add(name):
            if name not in supported:
                supported.append(name)

        # HTTP
        if 'HTTP' not in supported:
            ok, _, _ = self._probe_via(proxy, 'http', 'ip', timeout=timeout)
            if ok:
                add('HTTP')

        # HTTPS (CONNECT qua HTTP proxy)
        if self.cfg.get('probe_https', True) and 'HTTP' in supported and 'HTTPS' not in supported:
            p_http = self.proxy_url(proxy, 'http')
            try:
                r = self._thread_session().get(
                    'https://httpbin.org/ip',
                    proxies={'http': p_http, 'https': p_http},
                    timeout=timeout, verify=False
                )
                if r.status_code == 200:
                    add('HTTPS')
            except Exception:
                pass

        # SOCKS
        if self.cfg.get('probe_socks', True) and HAS_SOCKS:
            if 'SOCKS5' not in supported:
                ok, _, _ = self._probe_via(proxy, 'socks5', 'ip', timeout=timeout)
                if ok:
                    add('SOCKS5')
            if 'SOCKS4' not in supported:
                ok, _, _ = self._probe_via(proxy, 'socks4', 'ip', timeout=timeout)
                if ok:
                    add('SOCKS4')

        return ', '.join(supported) if supported else 'None'

    def check_multiple_rounds(self, proxy, rounds=2, min_success=0.7, already_ok=1, scheme='http'):
        # Round đầu đã pass trong check nhanh → chỉ cần thêm (rounds-1) lần
        need = max(0, rounds - already_ok)
        success = already_ok
        if need == 0:
            rate = success / max(rounds, 1)
            return rate >= min_success, rate
        timeout = self.cfg['timeout_check']
        for _ in range(need):
            ok, _, _ = self._probe_via(proxy, scheme, 'ip', timeout=timeout)
            if ok:
                success += 1
        rate = success / rounds
        return rate >= min_success, rate

    def parse_html_table(self, html):
        proxies = []
        try:
            soup = BeautifulSoup(html, 'html.parser')
            table = soup.find('table')
            if table:
                for row in table.find_all('tr')[1:300]:
                    cols = row.find_all('td')
                    if len(cols) >= 2:
                        ip = cols[0].text.strip()
                        port = cols[1].text.strip()
                        if ip and port and port.isdigit():
                            proxies.append(f"{ip}:{port}")
        except Exception:
            pass
        return proxies

    def parse_text(self, data):
        proxies = []
        seen = set()
        # ip:port | scheme://ip:port | ip:port:user:pass
        pat = re.compile(
            r'(?:(?:https?|socks[45]?)://)?'
            r'(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})'
            r'(?::([^\s:]+):([^\s]+))?',
            re.I
        )
        for line in data.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            m = pat.search(line)
            if not m:
                continue
            ip, port, user, pw = m.group(1), m.group(2), m.group(3), m.group(4)
            if ip == '0.0.0.0':
                continue
            key = f"{ip}:{port}:{user}:{pw}" if user and pw else f"{ip}:{port}"
            if key not in seen:
                seen.add(key)
                proxies.append(key)
        return proxies

    def parse_json(self, data):
        """Parse mauricegift-style JSON: {proxies:[...]} or {http:[],socks4:[],socks5:[]}."""
        try:
            obj = json.loads(data) if isinstance(data, str) else data
        except Exception:
            return []
        lines = []
        if isinstance(obj, list):
            lines = [str(x) for x in obj]
        elif isinstance(obj, dict):
            if isinstance(obj.get('proxies'), list):
                lines = [str(x) for x in obj['proxies']]
            else:
                for key in ('http', 'https', 'socks4', 'socks5', 'all'):
                    val = obj.get(key)
                    if isinstance(val, list):
                        lines.extend(str(x) for x in val)
        return self.parse_text('\n'.join(lines))

    def parse_text_auth(self, data):
        return self.parse_text(data)

    def remember_proxies(self, proxies, hint='all'):
        with self.lock:
            self.proxies.update(proxies)
            for p in proxies:
                self.proxy_hints[p] = merge_proto_hint(self.proxy_hints.get(p), hint)

    def schemes_for_hint(self, hint):
        """Thứ tự scheme Phase 1 theo hint nguồn."""
        hint = (hint or 'all').lower()
        if hint == 'http':
            return ['http']
        if hint == 'socks5':
            return ['socks5'] if HAS_SOCKS and self.cfg.get('probe_socks', True) else ['http']
        if hint == 'socks4':
            return ['socks4'] if HAS_SOCKS and self.cfg.get('probe_socks', True) else ['http']
        # all / unknown
        schemes = ['http']
        if self.cfg.get('probe_socks', True) and HAS_SOCKS:
            schemes += ['socks5', 'socks4']
        return schemes

    def fetch_source(self, source):
        proxies = []
        hint = source_proto(source)
        try:
            sys.stdout.write(f"\r  ⏳ {CYAN}{source['name']:22}{R} ...")
            sys.stdout.flush()
            headers = {'User-Agent': random.choice([
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
            ])}
            r = requests.get(source['url'], headers=headers, timeout=(5, self.cfg['timeout_fetch']))
            if r.status_code == 200:
                data = r.text
                if source['type'] == 'html_table':
                    proxies = self.parse_html_table(data)
                elif source['type'] == 'json':
                    proxies = self.parse_json(data)
                elif source['type'] == 'text':
                    proxies = self.parse_text(data)
                elif source['type'] == 'text_auth':
                    auth_proxies = self.parse_text_auth(data)
                    with self.lock:
                        self.auth_proxies.update(auth_proxies)
                        for p in auth_proxies:
                            self.proxy_hints[p] = merge_proto_hint(self.proxy_hints.get(p), hint)
                    proxies = auth_proxies
                # Chặn nguồn dump khổng lồ / lẫn loại (vd. MuRong ~100k)
                max_n = int(self.cfg.get('max_proxies_per_source', 15000) or 0)
                tag = {'http': 'HTTP', 'socks4': 'S4', 'socks5': 'S5', 'all': 'ALL'}.get(hint, '?')
                if max_n and len(proxies) > max_n:
                    print(f"\r  ⛔ {YELLOW}{source['name']:22}{R} {DIM}[{tag}] → bỏ {WHITE}{len(proxies):,}{R} {DIM}(>{max_n:,}/nguồn){R}")
                    return
                self.remember_proxies(proxies, hint)
                if len(proxies) > 100:
                    icon, color = '🚀', GREEN
                elif len(proxies) > 20:
                    icon, color = '📦', YELLOW
                else:
                    icon, color = '📄', BLUE
                print(f"\r  {icon} {color}{source['name']:22}{R} {DIM}[{tag}] → {WHITE}{len(proxies):>6}{R} {DIM}proxy{R}")
            else:
                print(f"\r  ❌ {RED}{source['name']:22}{R} {DIM}→ {RED}Lỗi {r.status_code}{R}")
        except requests.exceptions.Timeout:
            print(f"\r  ⏰ {YELLOW}{source['name']:22}{R} {DIM}→ {YELLOW}Timeout{R}")
        except Exception as e:
            print(f"\r  ❌ {RED}{source['name']:22}{R} {DIM}→ {RED}{str(e)[:20]}{R}")

    def enrich_proxy(self, proxy, lat, anonymity, primary='HTTP', hint='all'):
        """Chỉ chạy trên proxy đã sống: country + protocol + stability."""
        try:
            if lat > self.cfg['max_latency_check_ms']:
                return ('slow', None)
            if self.cfg['speed_test'] and lat > self.cfg['max_latency_ms']:
                return ('slow', None)

            ip = proxy.split(':')[0]
            country = self.get_country(ip)
            flag = self.country_flag(country)
            scheme = {'HTTP': 'http', 'SOCKS5': 'socks5', 'SOCKS4': 'socks4'}.get(primary, 'http')
            hint = (hint or 'all').lower()

            # Phase 1 bỏ qua anonymity → lấy ở đây (chỉ HTTP)
            if anonymity in (None, '', 'Unknown') and primary == 'HTTP':
                ok, _, resp = self._probe_via(proxy, 'http', path='headers', timeout=self._probe_timeout())
                if ok and resp is not None:
                    try:
                        anonymity = self.classify_anonymity(resp.json().get('headers', {}))
                    except Exception:
                        anonymity = 'Unknown'

            if hint == 'http':
                protocols = [primary] if primary else ['HTTP']
                if self.cfg.get('probe_https', True) and 'HTTPS' not in protocols:
                    p_http = self.proxy_url(proxy, 'http')
                    try:
                        r = self._thread_session().get(
                            'https://httpbin.org/ip',
                            proxies={'http': p_http, 'https': p_http},
                            timeout=self._probe_timeout(), verify=False
                        )
                        if r.status_code == 200:
                            protocols.append('HTTPS')
                    except Exception:
                        pass
                protocols = ', '.join(protocols)
            elif hint in ('socks4', 'socks5'):
                protocols = primary
            else:
                protocols = self.check_protocols(proxy, known=[primary] if primary else None)
            stable, stability_rate = self.check_multiple_rounds(
                proxy,
                rounds=self.cfg['check_rounds'],
                min_success=self.cfg['min_success_rate'],
                already_ok=1,
                scheme=scheme
            )
            if not stable:
                return ('unstable', None)

            item = {
                'proxy': proxy,
                'country': country,
                'flag': flag,
                'latency': lat,
                'anonymity': anonymity,
                'protocols': protocols,
                'primary': primary,
                'stability': f"{stability_rate*100:.0f}%",
                'stability_rate': stability_rate,
            }
            return ('ok', item)
        except Exception:
            return ('error', None)

    def save_protocol_files(self):
        """Tách file theo protocol: http / socks4 / socks5."""
        buckets = {'HTTP': set(), 'HTTPS': set(), 'SOCKS4': set(), 'SOCKS5': set()}
        for item in self.alive_with_details:
            for proto in (item.get('protocols') or '').split(','):
                proto = proto.strip().upper()
                if proto in buckets:
                    buckets[proto].add(item['proxy'])
            # primary luôn vào bucket tương ứng
            primary = (item.get('primary') or '').upper()
            if primary in buckets:
                buckets[primary].add(item['proxy'])

        mapping = [
            ('HTTP', self.cfg.get('http_file', 'proxies_http.txt'), buckets['HTTP'] | buckets['HTTPS']),
            ('SOCKS4', self.cfg.get('socks4_file', 'proxies_socks4.txt'), buckets['SOCKS4']),
            ('SOCKS5', self.cfg.get('socks5_file', 'proxies_socks5.txt'), buckets['SOCKS5']),
        ]
        for label, path, items in mapping:
            with open(path, 'w', encoding='utf-8') as f:
                for p in sorted(items):
                    f.write(f"{p}\n")
            print(f"{GREEN}  💾  {label:<6} {WHITE}{len(items):>5}{GREEN} → {YELLOW}{path}{R}")

    def _print_alive_row(self, item):
        lat = item['latency']
        anonymity = item['anonymity']
        color = GREEN if lat < 500 else YELLOW if lat < 1500 else BLUE
        icon = '⚡' if lat < 500 else '🔥' if lat < 1500 else '🌐'
        anon_icon = '🛡️' if anonymity == 'Elite' else '🔰' if anonymity == 'Anonymous' else '📡'
        rate = item.get('stability_rate', 0)
        print(f"  {icon} {item['flag']} {color}{item['proxy']:<28}{R} {DIM}{lat:>4}ms{R}  {anon_icon}{anonymity:<10} {item['protocols']:<14} {rate*100:>5.0f}%")
        sys.stdout.flush()

    def _progress_line(self, checked, total, alive_n, removed_slow, error_count, label_alive=None):
        pct = (checked / total) * 100 if total else 0
        elapsed = time.time() - self.start_time
        if checked > 0:
            eta_seconds = (total - checked) * (elapsed / checked)
            if eta_seconds >= 3600:
                eta_str = f"{int(eta_seconds // 3600)}h{int((eta_seconds % 3600) // 60)}m"
            elif eta_seconds > 60:
                eta_str = f"{int(eta_seconds // 60)}m{int(eta_seconds % 60):02d}s"
            else:
                eta_str = f"{int(eta_seconds)}s"
        else:
            eta_str = "?"
        bar_len = 12
        filled = int(bar_len * checked / total) if total else 0
        bar = '█' * filled + '░' * (bar_len - filled)
        dead_n = max(0, checked - alive_n - removed_slow - error_count)
        # Gọn ~70 ký tự — không tràn terminal
        line = (f"\r  {GOLD}{bar}{R} {WHITE}{checked}/{total}{R} {pct:4.1f}% "
                f"{GREEN}✓{alive_n}{R} {RED}✗{dead_n}{R} {YELLOW}↓{removed_slow}{R} "
                f"{elapsed:.0f}s→{eta_str}   ")
        return line

    def run_check_pipeline(self, proxy_list, title=None, hints=None):
        """Phase 1: check nhanh theo hint nguồn. Phase 2: enrich."""
        total = len(proxy_list)
        if total == 0:
            print(f"{RED}  ❌  Danh sách trống!{R}")
            return []

        hints = hints or {}
        if title:
            print(title)

        # List lớn → tăng thread (submit có giới hạn, không tạo 100k Future cùng lúc)
        base_workers = int(self.cfg['threads_check'])
        if total >= 50000:
            workers = min(500, max(base_workers, 300))
        elif total >= 20000:
            workers = min(400, max(base_workers, 250))
        else:
            workers = base_workers
        connect_t = self.cfg.get('timeout_connect', 1.5)
        read_t = self.cfg.get('timeout_check', 3)
        print(f"{DIM}  ⚡  Loại chậm > {self.cfg['max_latency_check_ms']}ms | Threads: {workers}/{self.cfg.get('threads_enrich', 40)} | Timeout: {connect_t}/{read_t}s | Hint theo nguồn{R}\n")

        candidates = []
        checked = 0
        error_count = 0
        removed_slow = 0
        last_progress = 0.0
        max_pending = workers * 3

        print(f"{BOLD}{CYAN}  ▶ Phase 1/2: check sống nhanh ({total:,} proxy) — theo loại nguồn{R}")
        print(f"{DIM}  ✓ sống  ✗ chết  ↓ loại chậm{R}")
        if self.cfg.get('probe_socks', True) and not HAS_SOCKS:
            print(f"{YELLOW}  ⚠️  Chưa có PySocks → SOCKS fallback HTTP. Cài: pip install pysocks{R}")
        self.begin_alive_file()
        try:
            with ThreadPoolExecutor(max_workers=workers) as ex:
                pending = {}
                proxy_iter = iter(proxy_list)

                def _submit_one(p):
                    fut = ex.submit(self.check_proxy_fast, p, hints.get(p, 'all'))
                    pending[fut] = p

                for _ in range(min(max_pending, total)):
                    try:
                        _submit_one(next(proxy_iter))
                    except StopIteration:
                        break

                while pending:
                    done_set, _ = wait(pending.keys(), return_when=FIRST_COMPLETED)
                    for future in done_set:
                        pending.pop(future, None)
                        checked += 1
                        try:
                            result = future.result(timeout=0)
                            if result:
                                proxy, lat, anonymity, primary = result
                                hint = hints.get(proxy, 'all')
                                if lat > self.cfg['max_latency_check_ms']:
                                    removed_slow += 1
                                elif self.cfg['speed_test'] and lat > self.cfg['max_latency_ms']:
                                    removed_slow += 1
                                else:
                                    candidates.append((proxy, lat, anonymity, primary, hint))
                                    self.append_alive_item({
                                        'proxy': proxy,
                                        'country': '??',
                                        'flag': '🌍',
                                        'latency': lat,
                                        'anonymity': anonymity,
                                        'protocols': primary,
                                        'primary': primary,
                                        'stability': 'pending',
                                    })
                                    if lat < 800:
                                        with self.lock:
                                            self.elite_proxies.add(proxy)
                                        self.append_elite(proxy)
                        except Exception:
                            error_count += 1

                        try:
                            _submit_one(next(proxy_iter))
                        except StopIteration:
                            pass

                    now = time.time()
                    if now - last_progress > 0.25 or checked == total:
                        last_progress = now
                        sys.stdout.write(self._progress_line(checked, total, len(candidates), removed_slow, error_count, 'Sống'))
                        sys.stdout.flush()

            print(f"\n{GREEN}  ✅  Phase 1: {WHITE}{len(candidates):,}{GREEN} sống (đã ghi file) / {WHITE}{total:,}{R}")
            print(f"{DIM}  💾  {os.path.abspath(self.cfg['alive_file'])}{R}")

            alive = []
            self.alive_with_details = []
            if not candidates:
                self.removed_slow = removed_slow
                return alive

            self.prefetch_countries([p.split(':')[0] for p, _, _, _, _ in candidates])

            print(f"{BOLD}{WHITE}{'Proxy':<28} {'Latency':<8} {'Anonymity':<12} {'Protocols':<18} {'Stability':<10}{R}")
            print(f"{DIM}{'─' * 84}{R}")
            print(f"{BOLD}{CYAN}  ▶ Phase 2/2: phân tích chi tiết ({len(candidates):,} proxy) — cập nhật file dần{R}")

            enrich_workers = min(self.cfg.get('threads_enrich', 40), max(8, len(candidates)))
            enriched = 0
            enrich_errors = 0
            last_progress = 0.0
            pending = {p: (lat, anon, primary, hint) for p, lat, anon, primary, hint in candidates}

            with ThreadPoolExecutor(max_workers=enrich_workers) as ex:
                futures = {
                    ex.submit(self.enrich_proxy, proxy, lat, anonymity, primary, hint): proxy
                    for proxy, lat, anonymity, primary, hint in candidates
                }
                for future in as_completed(futures):
                    enriched += 1
                    proxy_key = futures[future]
                    pending.pop(proxy_key, None)
                    try:
                        status, item = future.result(timeout=self.cfg['check_timeout_total'] * 4)
                        if status == 'slow':
                            removed_slow += 1
                        elif status == 'ok' and item:
                            if item['latency'] < 800:
                                with self.lock:
                                    self.elite_proxies.add(item['proxy'])
                            alive.append(item['proxy'])
                            self.alive_with_details.append(item)
                            self._print_alive_row(item)
                            merged = list(self.alive_with_details)
                            for p, (lat, anon, primary, hint) in pending.items():
                                merged.append({
                                    'proxy': p, 'country': '??', 'flag': '🌍', 'latency': lat,
                                    'anonymity': anon, 'protocols': primary, 'primary': primary,
                                    'stability': 'pending',
                                })
                            self.rewrite_alive_file(merged)
                        elif status == 'error':
                            enrich_errors += 1
                    except Exception:
                        enrich_errors += 1

                    now = time.time()
                    if now - last_progress > 0.25 or enriched == len(candidates):
                        last_progress = now
                        sys.stdout.write(self._progress_line(
                            enriched, len(candidates), len(alive), removed_slow, error_count + enrich_errors
                        ))
                        sys.stdout.flush()

            self.rewrite_alive_file(self.alive_with_details)
            self.save_protocol_files()
            self.elite_proxies = {
                i['proxy'] for i in self.alive_with_details if i['latency'] < 800
            }
            with self.save_lock:
                if self._elite_fp:
                    try:
                        self._elite_fp.close()
                    except Exception:
                        pass
                self._elite_fp = open(os.path.abspath(self.cfg['elite_file']), 'w', encoding='utf-8', buffering=1)
                for p in sorted(self.elite_proxies):
                    self._elite_fp.write(f"{p}\n")
                self._elite_fp.flush()

            self.removed_slow = removed_slow
            print("\n")
            return alive
        finally:
            self.close_save_files()

    def scrape_sources(self, sources):
        """Thu thập từ danh sách nguồn đã lọc. Trả về list proxy (đã loại trùng)."""
        self.proxy_hints.clear()
        self.proxies.clear()
        self.auth_proxies.clear()
        if not sources:
            print(f"{RED}  ❌  Không có nguồn nào khớp loại đã chọn.{R}")
            return []

        print(f"\n{BOLD}{GOLD}  📥  {_('scraping')} ({len(sources)} nguồn)...{R}\n")
        with ThreadPoolExecutor(max_workers=self.cfg['threads_fetch']) as ex:
            futures = {ex.submit(self.fetch_source, src): src for src in sources}
            done, not_done = wait(futures, timeout=self.cfg['timeout_fetch'] * 3 + 10)
            for future in done:
                try:
                    future.result()
                except Exception:
                    pass
            if not_done:
                print(f"{YELLOW}  ⚠️  Có {len(not_done)} nguồn chưa hoàn thành (bỏ qua).{R}")

        all_raw = list(set(list(self.proxies) + list(self.auth_proxies)))
        with open(self.cfg['raw_file'], 'w') as f:
            for p in sorted(all_raw):
                f.write(f"{p}\n")
        print(f"\n{GREEN}  ✅  Đã thu thập {WHITE}{len(all_raw):,}{GREEN} proxy (đã loại trùng){R}")
        return all_raw

    def scrape_and_check(self, sources=None, proto_filter='all'):
        self.start_time = time.time()
        start_vn = vn_datetime()
        self.removed_slow = 0
        self.elite_proxies.clear()

        if sources is None:
            sources = filter_sources_by_proto(PROXY_SOURCES + load_custom_sources(), proto_filter)
        total_sources = len(sources)
        label = {'http': 'HTTP', 'socks4': 'SOCKS4', 'socks5': 'SOCKS5', 'all': 'ALL'}.get(proto_filter, proto_filter)

        self.print_luxury_header(_('title'), start_vn, total_sources)
        print(f"{DIM}  🎯  Loại nguồn: {WHITE}{label}{R}")

        all_raw = self.scrape_sources(sources)
        raw_count = len(all_raw)

        if raw_count == 0:
            print(f"{RED}  ❌  Không có proxy để kiểm tra.{R}")
            return

        print(f"\n{BOLD}{MAGENTA}  🔍  {_('checking')} {raw_count:,} ...{R}")
        alive = self.run_check_pipeline(all_raw, hints=dict(self.proxy_hints))

        self.print_country_stats()

        elapsed = time.time() - self.start_time
        end_vn = vn_datetime()
        print(f"\n{BOLD}{GOLD}  ═══════════════════════════════════════════════════════════════════════{R}")
        print(f"{BOLD}{GREEN}  ✅  KẾT QUẢ [{label}]: {WHITE}{raw_count:,}{GREEN} raw → {WHITE}{len(alive):,}{GREEN} alive → {WHITE}{len(self.elite_proxies):,}{GREEN} elite{R}")
        print(f"{DIM}  ⏱️  {_('start')}: {start_vn}  |  {_('end')}: {end_vn}  |  {_('total_time')}: {elapsed:.1f}s  |  Loại chậm: {self.removed_slow}{R}")
        print(f"{BOLD}{GREEN}  💾  Đã lưu dần {WHITE}{len(alive):,}{GREEN} proxy → {YELLOW}{self.cfg['alive_file']}{R}")
        print(f"{BOLD}{GOLD}  ═══════════════════════════════════════════════════════════════════════{R}")

    def save_single_file(self, alive=None):
        """Ghi lại toàn bộ (dùng khi cần rewrite; pipeline đã lưu dần)."""
        with self.save_lock:
            with open(self.cfg['alive_file'], 'w', encoding='utf-8') as f:
                f.write("# Proxy | Country | Flag | Latency(ms) | Anonymity | Protocols | Stability\n")
                for item in self.alive_with_details:
                    f.write(f"{item['proxy']} | {item['country']} | {item['flag']} | {item['latency']} | {item['anonymity']} | {item['protocols']} | {item['stability']}\n")

    def check_alive_only(self, proxy_list):
        total = len(proxy_list)
        if total == 0:
            print(f"{RED}  ❌  Danh sách trống!{R}")
            return []
        self.elite_proxies.clear()
        title = f"\n{BOLD}{MAGENTA}  🔍  KIỂM TRA {total:,} PROXY + PHÂN TÍCH CHI TIẾT{R}"
        alive = self.run_check_pipeline(proxy_list, title=title)
        self.print_country_stats()
        print(f"{GREEN}  ✅  SỐNG: {WHITE}{len(alive):,}{GREEN}/{WHITE}{total:,} ({len(alive)/total*100:.1f}%){R}")
        print(f"{MAGENTA}  ⭐  ELITE: {WHITE}{len(self.elite_proxies):,}{R}")
        print(f"{BOLD}{GREEN}  💾  Đã lưu dần {WHITE}{len(alive):,}{GREEN} proxy → {YELLOW}{self.cfg['alive_file']}{R}")
        return alive

    def print_country_stats(self):
        country_counter = Counter([item['country'] for item in self.alive_with_details if item['country'] != '??'])
        if not country_counter:
            return
        total_alive = len(self.alive_with_details)
        print(f"\n{BOLD}{GOLD}  📊  {_('country_stats')}:{R}")
        print(f"{DIM}  ┌{'─' * 40}┐{R}")
        for country, count in country_counter.most_common(10):
            flag = self.country_flag(country)
            pct = (count / total_alive) * 100
            bar_len = int(pct / 2)
            bar = '█' * bar_len + '░' * (30 - bar_len)
            print(f"  │ {flag} {country:<4} {WHITE}{count:>5}{DIM} ({pct:>5.1f}%) {GOLD}{bar}{DIM} │")
        other = sum(1 for item in self.alive_with_details if item['country'] == '??')
        if other:
            print(f"  │ 🌍 {RED}??{DIM} {WHITE}{other:>5}{DIM} ({other/total_alive*100:>5.1f}%) {' ' * 22}│")
        print(f"{DIM}  └{'─' * 40}┘{R}")

    def print_luxury_header(self, title, start_time, total_sources):
        clear()
        width = 80
        print(f"{BOLD}{GOLD}{'═' * width}{R}")
        print(f"{BOLD}{GOLD}  {title}{R}")
        print(f"{DIM}  {_('start')}: {start_time}  |  Nguồn: {total_sources}  |  {_('menu')}: {_('exit')} [0]  |  HĐH: {OS_NAME}{R}")
        print(f"{BOLD}{GOLD}{'═' * width}{R}")

    def save(self, filename, proxy_list):
        with open(filename, 'w') as f:
            for p in sorted(proxy_list):
                f.write(f"{p}\n")
        print(f"{GREEN}  💾 Đã lưu {WHITE}{len(proxy_list):,} {GREEN}proxy vào {YELLOW}{filename}{R}")

# ==================== HÀM CHỌN FILE ====================
def select_file():
    txt_files = [f for f in os.listdir('.') if f.endswith('.txt') and os.path.isfile(f)]
    default_file = config.get('raw_file', 'proxies_raw.txt')
    
    if default_file in txt_files:
        print(f"{CYAN}  📂  File mặc định: {WHITE}{default_file}{R}")
        print(f"  {DIM}(Nhấn Enter để dùng file này, hoặc nhập tên file khác){R}")
        choice = input(f"{BOLD}{YELLOW}  → {R}").strip()
        if choice == '':
            return default_file
        if choice in txt_files:
            return choice
        if os.path.exists(choice):
            return choice
        print(f"{RED}  ❌  File không tồn tại!{R}")
        return None
    else:
        if not txt_files:
            print(f"{RED}  ❌  Không tìm thấy file .txt nào trong thư mục!{R}")
            return None
        print(f"{CYAN}  📂  Các file .txt có sẵn:{R}")
        for i, f in enumerate(txt_files, 1):
            print(f"     {GREEN}[{i}]{R} {f}")
        print(f"  {DIM}(Nhập số thứ tự hoặc tên file){R}")
        choice = input(f"{BOLD}{YELLOW}  → {R}").strip()
        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(txt_files):
                return txt_files[idx]
        if choice in txt_files:
            return choice
        if os.path.exists(choice):
            return choice
        print(f"{RED}  ❌  File không tồn tại!{R}")
        return None

# ==================== MENU CẤU HÌNH ====================
def config_menu():
    print(f"\n{BOLD}{GOLD}  ⚙️  {_('config')}{R}")
    print(f"{DIM}  ┌{'─' * 50}┐{R}")
    print(f"  │ 1. Số luồng thu thập  : {WHITE}{config['threads_fetch']:>4}{R}")
    print(f"  │ 2. Số luồng kiểm tra : {WHITE}{config['threads_check']:>4}{R}")
    print(f"  │ 3. Timeout kiểm tra  : {WHITE}{config['timeout_check']:>4}s{R}  {DIM}(read){R}")
    print(f"  │ 3b.Timeout connect   : {WHITE}{config.get('timeout_connect', 1.5):>4}s{R}")
    print(f"  │ 4. Latency tối đa    : {WHITE}{config['max_latency']:>4}s{R}")
    print(f"  │ 5. Batch size        : {WHITE}{config['batch_size']:>4}{R}")
    print(f"  │ 6. Speed test        : {WHITE}{'BẬT' if config['speed_test'] else 'TẮT':>4}{R}")
    print(f"  │ 7. Ngưỡng loại chậm  : {WHITE}{config['max_latency_check_ms']:>4}ms{R}")
    print(f"  │ 8. Số vòng kiểm tra  : {WHITE}{config['check_rounds']:>4}{R}")
    print(f"  │ 9. Ngôn ngữ          : {WHITE}{config.get('language', 'vi'):>4}{R}")
    print(f"  │ 10. Luồng enrich     : {WHITE}{config.get('threads_enrich', 40):>4}{R}")
    print(f"  │ 11. Probe HTTPS      : {WHITE}{'BẬT' if config.get('probe_https', True) else 'TẮT':>4}{R}")
    print(f"  │ 12. Probe SOCKS      : {WHITE}{'BẬT' if config.get('probe_socks', True) else 'TẮT':>4}{R}")
    print(f"  │ 13. Lưu cấu hình{R}")
    print(f"{DIM}  └{'─' * 50}┘{R}")
    print(f"  {DIM}(Nhập 3b để sửa timeout connect){R}")
    choice = input(f"\n{BOLD}{YELLOW}[?] Chọn (0-13 / 3b): {R}")
    if choice == '0':
        return
    elif choice == '1':
        config['threads_fetch'] = int(input("  Số luồng thu thập (mặc định 20): ") or 20)
    elif choice == '2':
        config['threads_check'] = int(input("  Số luồng kiểm tra (mặc định 150, list lớn auto↑500): ") or 150)
    elif choice == '3':
        config['timeout_check'] = float(input("  Read timeout (s) (mặc định 3): ") or 3)
    elif choice == '3b':
        config['timeout_connect'] = float(input("  Connect timeout (s) (mặc định 1.5): ") or 1.5)
    elif choice == '4':
        config['max_latency'] = float(input("  Latency tối đa (s) (mặc định 5.0): ") or 5.0)
    elif choice == '5':
        config['batch_size'] = int(input("  Batch size (mặc định 500): ") or 500)
    elif choice == '6':
        config['speed_test'] = not config['speed_test']
        print(f"  ✅ Speed test đã {'BẬT' if config['speed_test'] else 'TẮT'}")
    elif choice == '7':
        config['max_latency_check_ms'] = int(input("  Ngưỡng loại chậm (ms, mặc định 2000): ") or 2000)
    elif choice == '8':
        config['check_rounds'] = int(input("  Số vòng kiểm tra (mặc định 2): ") or 2)
    elif choice == '9':
        lang = input("  Ngôn ngữ (vi/en, mặc định vi): ") or 'vi'
        config['language'] = lang
        print(f"  ✅ Ngôn ngữ đã cập nhật: {lang}")
    elif choice == '10':
        config['threads_enrich'] = int(input("  Số luồng enrich (mặc định 40): ") or 40)
    elif choice == '11':
        config['probe_https'] = not config.get('probe_https', True)
        print(f"  ✅ Probe HTTPS đã {'BẬT' if config['probe_https'] else 'TẮT'}")
    elif choice == '12':
        config['probe_socks'] = not config.get('probe_socks', True)
        print(f"  ✅ Probe SOCKS đã {'BẬT' if config['probe_socks'] else 'TẮT'}")
        if config['probe_socks'] and not HAS_SOCKS:
            print(f"{YELLOW}  ⚠️  Cần: pip install pysocks{R}")
    elif choice == '13':
        save_config(config)
        print(f"{GREEN}  ✅ Đã lưu cấu hình vào {CONFIG_FILE}{R}")
    else:
        print(f"{RED}  ❌  Lựa chọn không hợp lệ!{R}")
    input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")

# ==================== GIAO DIỆN CHÍNH ====================
def banner():
    clear()
    print(f"""
{BOLD}{GOLD}╔══════════════════════════════════════════════════════════════════════════╗
║                                                                                  ║
║  {BOLD}{MAGENTA}███████╗██╗   ██╗███╗   ██╗██╗   ██╗████████╗ █████╗ ██╗{GOLD}          ║
║  {BOLD}{MAGENTA}██╔════╝██║   ██║████╗  ██║╚██╗ ██╔╝╚══██╔══╝██╔══██╗██║{GOLD}          ║
║  {BOLD}{MAGENTA}███████╗██║   ██║██╔██╗ ██║ ╚████╔╝    ██║   ███████║██║{GOLD}          ║
║  {BOLD}{MAGENTA}╚════██║██║   ██║██║╚██╗██║  ╚██╔╝     ██║   ██╔══██║██║{GOLD}          ║
║  {BOLD}{MAGENTA}███████║╚██████╔╝██║ ╚████║   ██║      ██║   ██║  ██║██║{GOLD}          ║
║  {BOLD}{MAGENTA}╚══════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝{GOLD}          ║
║                                                                                  ║
║  {BOLD}{YELLOW}██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗    ███████╗████████╗██╗   ██╗██╗     ███████╗{GOLD} ║
║  {BOLD}{YELLOW}██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝    ██╔════╝╚══██╔══╝██║   ██║██║     ██╔════╝{GOLD} ║
║  {BOLD}{YELLOW}██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝     ███████╗   ██║   ██║   ██║██║     █████╗  {GOLD} ║
║  {BOLD}{YELLOW}██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝      ╚════██║   ██║   ██║   ██║██║     ██╔══╝  {GOLD} ║
║  {BOLD}{YELLOW}██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║       ███████║   ██║   ╚██████╔╝███████╗███████╗{GOLD} ║
║  {BOLD}{YELLOW}╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝       ╚══════╝   ╚═╝    ╚═════╝ ╚══════╝╚══════╝{GOLD} ║
║                                                                                  ║
║  {BOLD}{CYAN}          {_('title')}{CYAN}                                           ║
║  {GREEN}   HTTP + SOCKS4/5 | TÁCH FILE THEO PROTOCOL | ĐA NỀN TẢNG{GOLD}             ║
║                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════╝{R}
""")

def show_menu():
    print(f"""
{BOLD}{GOLD}╔══════════════════════════════════════════════════════════════════════════╗
║                          {WHITE}☰  {_('menu')}  ☰{GOLD}                                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║     {GREEN}[1]{R}  🚀  Thu thập + kiểm tra (chọn HTTP/S4/S5/ALL)                  ║
║     {BLUE}[2]{R}  📥  Chỉ thu thập (chọn loại theo nguồn)                        ║
║     {CYAN}[3]{R}  🔍  Kiểm tra proxy từ file tùy chỉnh                           ║
║     {MAGENTA}[4]{R}  ⭐  Lọc Elite proxy (từ file sống)                             ║
║     {WHITE}[5]{R}  📊  Xem thống kê                                                ║
║     {YELLOW}[6]{R}  ⚙️  Cấu hình người dùng                                        ║
║     {RED}[0]{R}  💀  {_('exit')}                                                         ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝{R}
""")

def view_stats():
    try:
        raw = len(load_proxies_from_file(config['raw_file'])) if os.path.exists(config['raw_file']) else 0
        alive = len(load_proxies_from_file(config['alive_file'])) if os.path.exists(config['alive_file']) else 0
        elite = len(load_proxies_from_file(config['elite_file'])) if os.path.exists(config['elite_file']) else 0
        http_n = len(load_proxies_from_file(config.get('http_file', 'proxies_http.txt'))) if os.path.exists(config.get('http_file', 'proxies_http.txt')) else 0
        s4 = len(load_proxies_from_file(config.get('socks4_file', 'proxies_socks4.txt'))) if os.path.exists(config.get('socks4_file', 'proxies_socks4.txt')) else 0
        s5 = len(load_proxies_from_file(config.get('socks5_file', 'proxies_socks5.txt'))) if os.path.exists(config.get('socks5_file', 'proxies_socks5.txt')) else 0
        print(f"\n{BOLD}{GOLD}  📊  THỐNG KÊ PROXY{R}")
        print(f"{DIM}  ┌{'─' * 40}┐{R}")
        print(f"  │ {GREEN}📄 Proxy thô (raw):  {WHITE}{raw:>10,}{DIM} │")
        print(f"  │ {CYAN}🌐 Proxy sống:       {WHITE}{alive:>10,}{DIM} │")
        print(f"  │ {BLUE}🔗 HTTP/HTTPS:       {WHITE}{http_n:>10,}{DIM} │")
        print(f"  │ {YELLOW}🧦 SOCKS4:           {WHITE}{s4:>10,}{DIM} │")
        print(f"  │ {YELLOW}🧦 SOCKS5:           {WHITE}{s5:>10,}{DIM} │")
        print(f"  │ {MAGENTA}⭐ Proxy elite:      {WHITE}{elite:>10,}{DIM} │")
        print(f"{DIM}  └{'─' * 40}┘{R}")
    except:
        print(f"{RED}  ❌  Lỗi đọc file{R}")

def main():
    hunter = ProxyHunter(cfg=config)
    while True:
        banner()
        show_menu()
        choice = input(f"\n{BOLD}{YELLOW}[?] Chọn (0-6): {R}")
        if choice == '0':
            print(f"\n{GREEN}  👋  Tạm biệt SunyTai!{R}\n")
            break
        elif choice == '1':
            proto, sources = ask_proto_filter()
            if not sources:
                print(f"{RED}  ❌  Không có nguồn khớp loại đã chọn.{R}")
            else:
                hunter.scrape_and_check(sources=sources, proto_filter=proto)
            input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")
        elif choice == '2':
            proto, sources = ask_proto_filter()
            if not sources:
                print(f"{RED}  ❌  Không có nguồn khớp loại đã chọn.{R}")
            else:
                label = {'http': 'HTTP', 'socks4': 'SOCKS4', 'socks5': 'SOCKS5', 'all': 'ALL'}[proto]
                print(f"\n{BOLD}{GOLD}  📥  ĐANG THU THẬP [{label}]...{R}")
                all_proxies = hunter.scrape_sources(sources)
                print(f"\n{GREEN}  ✅  Đã lưu {WHITE}{len(all_proxies):,}{GREEN} proxy [{label}] → {YELLOW}{config['raw_file']}{R}")
            input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")
        elif choice == '3':
            file_path = select_file()
            if file_path is None:
                input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")
                continue
            proxy_list = load_proxies_from_file(file_path)
            if proxy_list:
                hunter.start_time = time.time()
                hunter.check_alive_only(proxy_list)
                print(f"{DIM}  ⏱️  Thời gian: {time.time() - hunter.start_time:.1f}s{R}")
            else:
                print(f"{RED}  ❌  File trống hoặc không có proxy hợp lệ.{R}")
            input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")
        elif choice == '4':
            if not os.path.exists(config['alive_file']):
                print(f"{RED}  ❌  Chưa có file {config['alive_file']}. Hãy kiểm tra sống trước.{R}")
                input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")
                continue
            alive_proxies = load_proxies_from_file(config['alive_file'])
            if alive_proxies:
                print(f"\n{YELLOW}  ⭐  Đang lọc Elite proxy (latency < 800ms)...{R}")
                hunter.elite_proxies.clear()
                hunter.check_alive_only(alive_proxies)
                if hunter.elite_proxies:
                    print(f"{GREEN}  💾  Elite đã lưu dần → {YELLOW}{config['elite_file']}{R}")
                else:
                    print(f"{RED}  ❌  Không tìm thấy Elite proxy{R}")
            else:
                print(f"{RED}  ❌  File sống trống hoặc không có proxy hợp lệ.{R}")
            input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")
        elif choice == '5':
            view_stats()
            input(f"\n{DIM}  [Nhấn Enter để tiếp tục...]{R}")
        elif choice == '6':
            config_menu()
        else:
            print(f"{RED}  ❌  Lựa chọn không hợp lệ!{R}")
            time.sleep(1)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}  ⚠️  Dừng bởi người dùng — proxy đã tìm được vẫn nằm trong file sống/elite{R}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{RED}  ❌  Lỗi: {e}{R}")