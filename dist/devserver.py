#!/usr/bin/env python3
"""Local dev server that disables caching entirely.

Plain `python -m http.server` lets browsers cache .js/.html aggressively,
which means after editing a file you can hit refresh and still see the OLD
version until you hard-refresh (Ctrl+Shift+R) or clear cache. That's exactly
the kind of thing that makes a real fix look like it "didn't do anything."
This server sends Cache-Control: no-store on every response so a normal
refresh always gets the current file on disk.

Usage: python devserver.py [port]   (defaults to 8843)
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8843
    HTTPServer(("", port), NoCacheHandler).serve_forever()
