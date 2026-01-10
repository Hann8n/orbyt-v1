#!/usr/bin/env python3
"""
Simple HTTP server for testing router locally
Serves 404.html for any route that doesn't exist as a file
This mimics GitHub Pages behavior
"""

import http.server
import socketserver
import os
from urllib.parse import urlparse

class RouterTestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Parse the URL path
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # Remove leading slash for file system path
        if path == '/':
            path = '/index.html'
        
        # Check if the file exists
        file_path = self.translate_path(path)
        
        # If file exists, serve it normally
        if os.path.isfile(file_path) and not path.startswith('/@'):
            # Let parent class handle existing files
            return super().do_GET()
        else:
            # For routes or non-existent files, serve 404.html
            # This allows the router to handle routing
            error_path = os.path.join(os.getcwd(), '404.html')
            
            if os.path.isfile(error_path):
                self.send_response(200)  # Send 200 so router can load
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                
                with open(error_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                # Fallback to 404
                self.send_error(404, "File not found")
    
    def translate_path(self, path):
        """Translate URL path to file system path"""
        path = path.split('?', 1)[0]
        path = path.split('#', 1)[0]
        # Remove leading /
        path = path.lstrip('/')
        if not path:
            path = 'index.html'
        return os.path.join(os.getcwd(), path)
    
    def log_message(self, format, *args):
        """Custom logging to show what's being served"""
        # Only log non-favicon requests
        if not args[0].startswith('GET /favicon'):
            print(f"{self.address_string()} - {format % args}")

PORT = 8000

if __name__ == '__main__':
    # Change to the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), RouterTestHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}/")
        print(f"Test URLs:")
        print(f"  http://localhost:{PORT}/")
        print(f"  http://localhost:{PORT}/@username")
        print(f"  http://localhost:{PORT}/@username/postid")
        print(f"Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")
