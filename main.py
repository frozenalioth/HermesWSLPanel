#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hermes WSL Panel - Hermes AI 启动控制台
"""

import subprocess
import json
import os
import sys
import threading
import time
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory

# PyInstaller 打包后的资源路径
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ============================================================
# 配置（从设置读取，首次启动由用户检测）
# ============================================================

app = Flask(__name__, static_folder=None)

# ============================================================
# 设置持久化（存到 exe 同级目录，重启不丢）
# ============================================================
def get_settings_path():
    """获取 settings.json 路径"""
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
    else:
        base = BASE_DIR
    path = os.path.join(base, 'data')
    os.makedirs(path, exist_ok=True)
    return os.path.join(path, 'settings.json')

def load_settings():
    """加载设置"""
    path = get_settings_path()
    defaults = {
        'theme': 'light',
        'font_size': 14,
        'hermes_cli': '',
        'hermes_home': '',
    }
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return {**defaults, **json.load(f)}
    except:
        return defaults

def save_settings(data):
    """保存设置"""
    path = get_settings_path()
    current = load_settings()
    current.update(data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(current, f, ensure_ascii=False, indent=2)
    return current

# ============================================================
# 动态获取 Hermes 路径
# ============================================================

def get_hermes_cli():
    """从设置读取 Hermes CLI 路径"""
    settings = load_settings()
    return settings.get('hermes_cli', '')

def get_hermes_home():
    """从设置读取 Hermes 配置目录"""
    settings = load_settings()
    return settings.get('hermes_home', '')

# ============================================================
# WSL 工具函数（隐藏窗口版）
# ============================================================

def wsl_run(command, timeout=30):
    """在 WSL 中执行命令（不弹窗）"""
    full_cmd = ["wsl", "~", "-e"] + command
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    try:
        result = subprocess.run(
            full_cmd,
            capture_output=True,
            timeout=timeout,
            startupinfo=startupinfo
        )
        stdout = stderr = ""
        if result.stdout:
            try:
                stdout = result.stdout.decode('utf-8')
            except:
                try:
                    stdout = result.stdout.decode('gbk')
                except:
                    stdout = result.stdout.decode('utf-8', errors='replace')
        if result.stderr:
            try:
                stderr = result.stderr.decode('utf-8')
            except:
                try:
                    stderr = result.stderr.decode('gbk')
                except:
                    stderr = result.stderr.decode('utf-8', errors='replace')
        return stdout, stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "命令执行超时", -1
    except FileNotFoundError:
        return "", "wsl 命令未找到", -1

def wsl_python(python_code, timeout=15):
    return wsl_run(["python3", "-c", python_code], timeout=timeout)

def hermes_cmd(profile, args, timeout=30):
    cli = get_hermes_cli()
    if not cli:
        return "", "Hermes 路径未配置", -1
    return wsl_run([cli, "-p", profile] + args, timeout=timeout)

# ============================================================
# 数据获取
# ============================================================

def get_profile_db_path(profile):
    home = get_hermes_home()
    if not home:
        return ""
    if profile == "default":
        return f"{home}/state.db"
    return f"{home}/profiles/{profile}/state.db"

def parse_profile_list(text):
    profiles = []
    for line in text.strip().split('\n'):
        line = line.strip()
        if not line or 'Profile' in line or not any(c.isalpha() for c in line):
            continue
        words = [w for w in line.split() if w.strip() and w not in ('—', '-', '─', '═')]
        if len(words) >= 3:
            name = words[0].replace('◆', '').strip()
            if name and len(name) < 30:
                profiles.append({'name': name, 'model': words[1], 'gateway': words[2]})
    return profiles

def parse_skills_list(text):
    skills = []
    in_table = False
    for line in text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        if 'Name' in line and 'Category' in line:
            in_table = True
            continue
        if in_table and (line.startswith('└') or line.startswith('0 hub')):
            break
        if in_table and line.startswith('│'):
            parts = [p.strip() for p in line.split('│')]
            if len(parts) >= 4:
                name = parts[1]
                category = parts[2]
                status = parts[-1]
                if name and not name.startswith('─'):
                    skills.append({'name': name, 'category': category, 'status': status})
    return skills

# ============================================================
# API 路由
# ============================================================

@app.route('/')
def index():
    return send_from_directory(os.path.join(BASE_DIR, 'frontend'), 'index.html')

@app.route('/photos/<path:path>')
def serve_photos(path):
    return send_from_directory(os.path.join(BASE_DIR, 'photos'), path)

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(os.path.join(BASE_DIR, 'frontend'), path)

# ---- 设置 ----

@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    if request.method == 'POST':
        data = request.get_json()
        saved = save_settings(data)
        return jsonify(saved)
    return jsonify(load_settings())

# ---- 首次设置 / 检测 Hermes ----

@app.route('/api/setup/detect', methods=['POST'])
def api_setup_detect():
    """自动检测 WSL 中的 Hermes 位置"""
    # 1. 检测 WSL 是否可用
    wsl_stdout, wsl_stderr, wsl_code = wsl_run(["bash", "-c", "echo WSL_OK"])
    if wsl_code != 0 or 'WSL_OK' not in wsl_stdout:
        return jsonify({'error': 'WSL 未运行或未安装'}), 400

    # 2. 检测 Hermes CLI 路径
    hermes_stdout, hermes_stderr, hermes_code = wsl_run(["bash", "-c", "which hermes"])
    hermes_cli = hermes_stdout.strip() if hermes_code == 0 else ''

    if not hermes_cli:
        # 尝试常见位置
        for path in [
            "/home/linuxbrew/.linuxbrew/bin/hermes",
            "/usr/local/bin/hermes",
            "/usr/bin/hermes",
            "~/.local/bin/hermes",
        ]:
            test_out, _, test_code = wsl_run(["bash", "-c", f"test -f {path} && echo OK"])
            if test_code == 0 and 'OK' in test_out:
                hermes_cli = path
                break

    if not hermes_cli:
        return jsonify({'error': '未找到 Hermes，请确认已在 WSL 中安装'}), 400

    # 3. 检测 Hermes 版本
    ver_out, _, _ = wsl_run([hermes_cli, "--version"])
    version = ver_out.strip().split('\n')[0][:60] if ver_out else "未知"

    # 4. 检测 HERMES_HOME（配置目录）
    home_stdout, _, home_code = wsl_run(["bash", "-c", "echo $HOME"])
    user_home = home_stdout.strip() if home_code == 0 else "/home"
    hermes_home = f"{user_home}/.hermes"

    return jsonify({
        'hermes_cli': hermes_cli,
        'hermes_home': hermes_home,
        'version': version,
    })

# ---- Profile ----

@app.route('/api/profiles')
def api_profiles():
    cli = get_hermes_cli()
    if not cli:
        return jsonify({'profiles': []})
    stdout, stderr, code = wsl_run([cli, "profile", "list"])
    if code != 0:
        return jsonify({'profiles': []})
    return jsonify({'profiles': parse_profile_list(stdout)})

@app.route('/api/profile/<name>')
def api_profile_detail(name):
    stdout, stderr, code = hermes_cmd(name, ["profile", "show", name])
    info = {}
    for line in stdout.strip().split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            info[k.strip().lower()] = v.strip()
    return jsonify({
        'name': name,
        'model': info.get('model', 'unknown'),
        'skills_count': info.get('skills', '0'),
    })

@app.route('/api/profile/<name>/model', methods=['POST'])
def api_set_model(name):
    """切换模型（修改 config.yaml）"""
    data = request.get_json()
    model = data.get('model', '')
    if not model:
        return jsonify({'error': '模型名不能为空'}), 400
    home = get_hermes_home()
    if not home:
        return jsonify({'error': 'Hermes 路径未配置'}), 400
    cfg_path = f"{home}/profiles/{name}/config.yaml" if name != "default" else f"{home}/config.yaml"
    sed_cmd = f"sed -i 's/^model:.*/model: {model}/' {cfg_path}"
    wsl_run(["bash", "-c", sed_cmd])
    provider = data.get('provider', '')
    if provider:
        sed_cmd2 = f"sed -i 's/^  provider:.*/  provider: {provider}/' {cfg_path}"
        wsl_run(["bash", "-c", sed_cmd2])
    return jsonify({'status': 'ok', 'model': model})

# ---- 新建 Profile ----

@app.route('/api/profile', methods=['POST'])
def api_create_profile():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '名称不能为空'}), 400
    stdout, stderr, code = wsl_run([get_hermes_cli(), "profile", "create", name])
    if code != 0:
        return jsonify({'error': stderr or '创建失败'}), 500
    return jsonify({'status': 'ok', 'name': name})


@app.route('/api/profile/<name>/delete', methods=['POST'])
def api_delete_profile(name):
    """删除 Profile"""
    stdout, stderr, code = wsl_run([get_hermes_cli(), "profile", "delete", name])
    if code != 0:
        return jsonify({'error': stderr or '删除失败'}), 500
    return jsonify({'status': 'ok'})


@app.route('/api/profile/<name>/sessions/<session_id>/delete', methods=['POST'])
def api_delete_session(name, session_id):
    """删除会话"""
    stdout, stderr, code = hermes_cmd(name, ["sessions", "delete", "--yes", session_id])
    if code != 0:
        return jsonify({'error': stderr or '删除失败'}), 500
    return jsonify({'status': 'ok'})


# ---- 会话 ----

@app.route('/api/profile/<name>/sessions')
def api_profile_sessions(name):
    """会话列表，支持排序和搜索"""
    sort = request.args.get('sort', 'ended_at')
    search = request.args.get('search', '').strip()
    db_path = get_profile_db_path(name)
    if not db_path:
        return jsonify({'sessions': []})
    order_map = {
        'ended_at': 'COALESCE(ended_at, started_at) DESC',
        'started_at': 'started_at DESC',
        'message_count': 'message_count DESC',
    }
    order_sql = order_map.get(sort, 'COALESCE(ended_at, started_at) DESC')
    where_sql = ''
    if search:
        safe_search = search.replace("'", "''")
        where_sql = f"WHERE (title LIKE '%{safe_search}%' OR id LIKE '%{safe_search}%')"
    py_code = f'''import sqlite3,json,datetime
db=\"{db_path}\"
sql=f"SELECT id,title,started_at,ended_at,message_count,source FROM sessions {where_sql} ORDER BY {order_sql} LIMIT 100"
c=sqlite3.connect(db).execute(sql)
s=[]
source_map={{"qqbot":"qqbot","telegram":"telegram","discord":"discord","whatsapp":"whatsapp","slack":"slack","sms":"sms","web":"web"}}
for sid,title,st,end,msg,src in c.fetchall():
    dt=datetime.datetime.fromtimestamp(end or st).strftime("%Y-%m-%d %H:%M") if (end or st) else ""
    label=(title or "(无标题)")[:60]
    if src and src!="cli" and not label.startswith("["):
        prefix=source_map.get(src,src)
        label=f"[{{prefix}}]{{label}}"
    s.append({{"id":sid,"title":label,"last_active":dt,"message_count":msg or 0}})
print(json.dumps(s,ensure_ascii=False))'''
    stdout, stderr, code = wsl_python(py_code)
    if code != 0 or not stdout.strip():
        return jsonify({'sessions': []})
    try:
        return jsonify({'sessions': json.loads(stdout.strip())})
    except:
        return jsonify({'sessions': []})

@app.route('/api/profile/<name>/sessions/<session_id>')
def api_session_detail(name, session_id):
    db_path = get_profile_db_path(name)
    if not db_path:
        return jsonify({'messages': []})
    py_code = f'''import sqlite3,json,datetime
db=\"{db_path}\"
c=sqlite3.connect(db).execute("SELECT role,content,timestamp FROM messages WHERE session_id=? AND active=1 ORDER BY id",(\"{session_id}\",))
ms=[]
for r,co,ts in c.fetchall():
    ms.append({{"role":r,"content":(co or "")[:300],"timestamp":datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else ""}})
print(json.dumps(ms,ensure_ascii=False))'''
    stdout, stderr, code = wsl_python(py_code)
    if code != 0 or not stdout.strip():
        return jsonify({'messages': []})
    try:
        return jsonify({'messages': json.loads(stdout.strip())})
    except:
        return jsonify({'messages': []})

# ---- 会话重命名 ----

@app.route('/api/profile/<name>/sessions/<session_id>/rename', methods=['POST'])
def api_rename_session(name, session_id):
    """重命名会话（base64编码防特殊字符）"""
    data = request.get_json()
    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': '标题不能为空'}), 400
    import base64
    title_b64 = base64.b64encode(title.encode('utf-8')).decode('ascii')
    db_path = get_profile_db_path(name)
    if not db_path:
        return jsonify({'error': 'Hermes 路径未配置'}), 400
    py_code = f'''import sqlite3,base64
db=\"{db_path}\"
c=sqlite3.connect(db)
title=base64.b64decode(\"{title_b64}\").decode("utf-8")
c.execute("UPDATE sessions SET title=? WHERE id=?", (title, \"{session_id}\"))
c.connection.commit()
print("ok")'''
    stdout, stderr, code = wsl_python(py_code)
    if code != 0:
        return jsonify({'error': stderr or '重命名失败'}), 500
    return jsonify({'status': 'ok', 'title': title})


# ---- 批量删除会话 ----

@app.route('/api/profile/<name>/sessions/batch-delete', methods=['POST'])
def api_batch_delete_sessions(name):
    """批量删除会话"""
    data = request.get_json()
    ids = data.get('ids', [])
    if not ids:
        return jsonify({'error': '未选择会话'}), 400
    errors = []
    for sid in ids:
        stdout, stderr, code = hermes_cmd(name, ["sessions", "delete", "--yes", sid])
        if code != 0:
            errors.append(sid)
    return jsonify({'status': 'ok', 'deleted': len(ids) - len(errors), 'errors': errors})


# ---- 日志查看器 ----

@app.route('/api/profile/<name>/logs')
def api_profile_logs(name):
    """获取日志内容"""
    log_type = request.args.get('type', 'agent')
    lines = request.args.get('lines', '100')
    stdout, stderr, code = hermes_cmd(name, ["logs", log_type, "-n", lines])
    if code != 0:
        return jsonify({'error': stderr or '获取日志失败', 'content': ''})
    return jsonify({'content': stdout})


@app.route('/api/profile/<name>/logs/list')
def api_logs_list(name):
    """获取可用日志文件列表"""
    stdout, stderr, code = hermes_cmd(name, ["logs", "list"])
    if code != 0:
        return jsonify({'error': stderr or '获取日志列表失败', 'files': []})
    return jsonify({'files': stdout})


# ---- 网络诊断 ----

@app.route('/api/diagnose')
def api_diagnose():
    """网络诊断"""
    results = []

    # 1. 检查 WSL
    stdout, stderr, code = wsl_run(["bash", "-c", "echo WSL_OK && uname -a"])
    if code == 0 and 'WSL_OK' in stdout:
        results.append({'name': 'WSL 状态', 'status': 'ok', 'detail': 'WSL 运行正常'})
    else:
        results.append({'name': 'WSL 状态', 'status': 'error', 'detail': 'WSL 未响应'})

    # 2. 检查 Hermes CLI
    cli = get_hermes_cli()
    if cli:
        stdout, stderr, code = wsl_run([cli, "--version"])
        if code == 0:
            ver = stdout.strip().split('\n')[0][:60]
            results.append({'name': 'Hermes CLI', 'status': 'ok', 'detail': ver})
        else:
            results.append({'name': 'Hermes CLI', 'status': 'error', 'detail': 'Hermes 未响应'})
    else:
        results.append({'name': 'Hermes CLI', 'status': 'error', 'detail': '未配置 Hermes 路径'})

    # 3. 检查代理
    stdout, stderr, code = wsl_run(["bash", "-c", "echo $http_proxy; echo $https_proxy"])
    http_proxy = (stdout.split('\n')[0] or '').strip()
    https_proxy = (stdout.split('\n')[1] or '').strip()
    if http_proxy or https_proxy:
        results.append({'name': '代理配置', 'status': 'warn', 'detail': f'http={http_proxy or "无"} https={https_proxy or "无"}'})
    else:
        results.append({'name': '代理配置', 'status': 'ok', 'detail': '无代理配置'})

    return jsonify({'results': results})


# ---- 检查更新 ----

@app.route('/api/version/check')
def api_version_check():
    """检查 Hermes 更新"""
    cli = get_hermes_cli()
    if not cli:
        return jsonify({'version': '', 'update_info': 'Hermes 未配置', 'update_available': False})
    stdout, stderr, code = wsl_run([cli, "version"])
    update_available = False
    version_line = ''
    commit_info = ''
    for line in stdout.split('\n'):
        if 'Hermes Agent' in line:
            version_line = line.strip()[:80]
        if 'Update available' in line or 'Up to date' in line:
            commit_info = line.strip()[:80]
            update_available = 'Update available' in line
    return jsonify({
        'version': version_line,
        'update_info': commit_info,
        'update_available': update_available,
    })


# ---- WSL 启动 ----

@app.route('/api/wsl/start', methods=['POST'])
def api_wsl_start():
    """弹窗启动 WSL 终端"""
    try:
        subprocess.Popen(
            'start "WSL" cmd /k wsl ~',
            shell=True
        )
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ---- Skills ----

@app.route('/api/profile/<name>/skills')
def api_profile_skills(name):
    stdout, stderr, code = hermes_cmd(name, ["skills", "list"])
    skills = parse_skills_list(stdout)
    categories = {}
    for s in skills:
        cat = s['category'] or '其他'
        categories.setdefault(cat, []).append(s['name'])
    return jsonify({'skills': skills, 'categories': categories, 'total': len(skills)})

# ---- MCP ----

@app.route('/api/profile/<name>/mcp')
def api_profile_mcp(name):
    stdout, stderr, code = hermes_cmd(name, ["mcp", "list"])
    servers = []
    for line in stdout.strip().split('\n'):
        line = line.strip()
        if not line or 'No MCP' in line or 'Add one' in line or line.startswith('hermes mcp'):
            continue
        servers.append(line)
    return jsonify({'servers': servers, 'has_servers': len(servers) > 0})

# ---- 启动/恢复（这些要弹窗，是功能） ----

@app.route('/api/profile/<name>/launch', methods=['POST'])
def api_launch_profile(name):
    cli = get_hermes_cli()
    if not cli:
        return jsonify({'error': 'Hermes 路径未配置'}), 400
    try:
        subprocess.Popen(
            ['cmd', '/c', 'start', 'Hermes - ' + name, 'cmd', '/k',
             f'wsl ~ -e {cli} -p {name}'],
            shell=True
        )
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile/<name>/resume/<session_id>', methods=['POST'])
def api_resume_session(name, session_id):
    cli = get_hermes_cli()
    if not cli:
        return jsonify({'error': 'Hermes 路径未配置'}), 400
    try:
        subprocess.Popen(
            ['cmd', '/c', 'start', 'Hermes - ' + name, 'cmd', '/k',
             f'wsl ~ -e {cli} -p {name} chat --resume {session_id}'],
            shell=True
        )
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# 启动
# ============================================================

def run_flask():
    app.run(host='127.0.0.1', port=8081, debug=False, use_reloader=False)

def main():
    print("启动 Hermes WSL Panel...")
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    try:
        import webview
        webview.create_window(
            title='Hermes WSL Panel', url='http://127.0.0.1:8081',
            width=1200, height=692, min_size=(800, 600),
            resizable=True, text_select=True,
        )
        webview.start()
    except ImportError:
        import webbrowser
        time.sleep(1.5)
        webbrowser.open('http://127.0.0.1:8081')
        flask_thread.join()

if __name__ == '__main__':
    main()
