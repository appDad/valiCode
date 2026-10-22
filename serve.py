#!/usr/bin/env python3
"""
Fallback launcher for ValiCode.html when the browser will not open local files
(some locked-down desktops block file:// URLs).

Serves ValiCode.html from a loopback HTTP server, exactly the pattern Vali's
notebook already uses, and prints/opens the URL. Nothing leaves the machine.

Terminal:   python serve.py
Jupyter:    exec(open("serve.py").read())
"""
import html
import os
import secrets
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
PAGE = os.path.join(HERE, "ValiCode.html")
TOKEN = secrets.token_urlsafe(16)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != f"/?t={TOKEN}":
            self.send_response(403)
            self.end_headers()
            return
        with open(PAGE, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def main():
    if "_compare_server" in globals():
        globals()["_compare_server"].shutdown()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    globals()["_compare_server"] = server
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/?t={TOKEN}"
    try:
        from IPython.display import HTML, display  # running inside Jupyter
        display(HTML(f'<a href="{html.escape(url)}" target="_blank"><b>Open Vali Code</b></a>'))
    except ImportError:
        print("Vali Code:", url)
        webbrowser.open(url)
        try:
            server.serve_forever()  # keep the process alive in a terminal
        except KeyboardInterrupt:
            pass


main()
