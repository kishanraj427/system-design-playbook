#!/usr/bin/env python3
"""Inline css/ and js/ into one self-contained file: dist/index.html.

Usage (from the project folder):  python3 tools/bundle.py
The multi-file index.html works as-is by double-clicking; this only produces
the single-file version for sharing.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()

def main():
    html = read('index.html')
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">',
                  lambda m: '<style>' + read(m.group(1)).replace('</style', '<\\/style') + '</style>', html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>',
                  lambda m: '<script>' + read(m.group(1)).replace('</script', '<\\/script') + '</script>', html)
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    out = os.path.join(ROOT, 'dist', 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'wrote {os.path.relpath(out, ROOT)} ({len(html.encode()):,} bytes)')

if __name__ == '__main__':
    sys.exit(main())
