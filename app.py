import os
import time
import hashlib
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, render_template, request
from bs4 import BeautifulSoup

app = Flask(__name__)

# Cache configuration
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
cache = {
    "data": None,
    "last_fetched": 0,
    "feed_title": "BigQuery - Release notes"
}
CACHE_DURATION_SECS = 600  # 10 minutes cache

def get_plain_text(html_content):
    """Convert HTML snippet to clean plain text for tweeting."""
    if not html_content:
        return ""
    soup = BeautifulSoup(html_content, 'html.parser')
    # Replace links with text (href) to keep links readable in tweet, or just get plain text
    # Let's keep it simple: extract text and clean up whitespace
    text = soup.get_text()
    # Normalize whitespace
    text = re_normalize_whitespace(text)
    return text

def re_normalize_whitespace(text):
    import re
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def fetch_and_parse_feed():
    global cache
    
    req = urllib.request.Request(FEED_URL, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FeedReader/1.0'})
    with urllib.request.urlopen(req, timeout=15) as response:
        xml_data = response.read()
        
    root = ET.fromstring(xml_data)
    
    # Extract feed title
    feed_title = "BigQuery - Release notes"
    title_elem = root.find('{http://www.w3.org/2005/Atom}title')
    if title_elem is not None and title_elem.text:
        feed_title = title_elem.text
        
    entries = root.findall('{http://www.w3.org/2005/Atom}entry')
    parsed_entries = []
    
    for entry in entries:
        title = entry.find('{http://www.w3.org/2005/Atom}title').text
        updated = entry.find('{http://www.w3.org/2005/Atom}updated').text
        link_elem = entry.find('{http://www.w3.org/2005/Atom}link')
        link = link_elem.attrib.get('href') if link_elem is not None else ""
        content_elem = entry.find('{http://www.w3.org/2005/Atom}content')
        content_html = content_elem.text if content_elem is not None else ""
        
        updates = []
        if content_html:
            soup = BeautifulSoup(content_html, 'html.parser')
            current_type = "General"
            current_blocks = []
            
            def add_update(type_name, blocks):
                if not blocks:
                    return
                # Render HTML string for the update block
                block_html = "".join(str(b) for b in blocks).strip()
                block_text = get_plain_text(block_html)
                if not block_text:
                    return
                # Create a unique ID
                hash_input = f"{updated}_{type_name}_{block_html}"
                block_id = hashlib.md5(hash_input.encode('utf-8')).hexdigest()
                
                updates.append({
                    "id": block_id,
                    "type": type_name,
                    "html": block_html,
                    "text": block_text,
                    "link": link
                })

            for child in soup.contents:
                if child.name in ['h3', 'h4', 'h2']:
                    add_update(current_type, current_blocks)
                    current_type = child.get_text().strip()
                    current_blocks = []
                else:
                    current_blocks.append(child)
                    
            add_update(current_type, current_blocks)
            
        parsed_entries.append({
            "title": title,
            "updated": updated,
            "link": link,
            "updates": updates
        })
        
    cache["data"] = parsed_entries
    cache["last_fetched"] = time.time()
    cache["feed_title"] = feed_title
    return parsed_entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    # Use cached data if fresh enough and not forced
    if not force_refresh and cache["data"] is not None and (now - cache["last_fetched"] < CACHE_DURATION_SECS):
        return jsonify({
            "status": "success",
            "feed_title": cache["feed_title"],
            "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
            "cached": True,
            "data": cache["data"]
        })
        
    try:
        data = fetch_and_parse_feed()
        return jsonify({
            "status": "success",
            "feed_title": cache["feed_title"],
            "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
            "cached": False,
            "data": data
        })
    except Exception as e:
        # If fetch fails but we have cached data, return cached data as fallback with error info
        if cache["data"] is not None:
            return jsonify({
                "status": "partial_success",
                "feed_title": cache["feed_title"],
                "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
                "cached": True,
                "warning": f"Could not fetch fresh feed ({str(e)}). Displaying cached data.",
                "data": cache["data"]
            })
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch release notes: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
