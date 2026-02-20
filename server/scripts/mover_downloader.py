#!/usr/bin/env python3
"""
Mover.uz Video Downloader
Custom downloader for mover.uz videos

Usage:
    python mover_downloader.py <video_url> <output_directory>

Example:
    python mover_downloader.py "https://mover.uz/watch/qY6lqHNe" "C:/Videos"
"""

import sys
import os
import requests
from urllib.parse import urlparse
import json
import re

# Maximum download size (2 GB)
MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024

# Windows reserved filenames
WINDOWS_RESERVED = re.compile(r'^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$', re.IGNORECASE)


def validate_mover_url(url):
    """Validate that the URL belongs to mover.uz and uses https"""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    host = parsed.hostname.lower() if parsed.hostname else ''
    if host not in ('mover.uz', 'www.mover.uz'):
        return False
    return True


def sanitize_filename(name):
    """Sanitize a string for use as a filename (preserve emoji & Unicode)"""
    # Remove only truly illegal filename characters: < > : " / \ | ? *
    # Preserve emoji, Unicode, and other safe characters
    name = re.sub(r'[<>:"/\\|?*]', '_', name).strip()
    if WINDOWS_RESERVED.match(name):
        name = '_' + name
    if len(name) > 200:
        name = name[:200]
    return name or 'video'


def extract_video_id(url):
    """Extract video ID from mover.uz URL"""
    # Pattern: https://mover.uz/watch/VIDEO_ID
    match = re.search(r'/watch/([a-zA-Z0-9_-]+)', url)
    if match:
        return match.group(1)
    return None

def download_mover_video(url, output_dir):
    """
    Download video from mover.uz
    Video URL format: https://v.mover.uz/VIDEO_ID_h.mp4
    """
    
    print(f"Downloading from mover.uz: {url}")
    print(f"Output directory: {output_dir}")
    
    # Validate URL domain
    if not validate_mover_url(url):
        print("ERROR: URL must be from mover.uz domain (http/https)")
        return False
    
    # Validate output directory is an absolute path
    if not os.path.isabs(output_dir):
        print("ERROR: Output directory must be an absolute path")
        return False
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # Extract video ID from URL
        video_id = extract_video_id(url)
        if not video_id:
            print("ERROR: Could not extract video ID from URL")
            print("Expected format: https://mover.uz/watch/VIDEO_ID")
            return False
        
        print(f"Video ID: {video_id}")
        
        # Step 1: Fetch the video page to get title
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://mover.uz/'
        }
        
        print("Fetching video page...")
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        # Extract title from HTML
        title_match = re.search(r'<title>([^<]+)</title>', response.text)
        if title_match:
            title = title_match.group(1).strip()
            title = title.replace(' - Mover.uz', '').strip()
            title = sanitize_filename(title)
        else:
            title = video_id
        
        print(f"Title: {title}")
        
        # Step 2: Construct video URL
        # Format: https://v.mover.uz/VIDEO_ID_h.mp4
        video_url = f"https://v.mover.uz/{video_id}_h.mp4"
        print(f"Video URL: {video_url}")
        
        # Step 3: Download the video
        output_file = os.path.join(output_dir, f"{title}.mp4")
        
        print(f"Downloading to: {output_file}")
        print("This may take a while...")
        
        video_response = requests.get(video_url, headers=headers, stream=True, timeout=60)
        video_response.raise_for_status()
        
        total_size = int(video_response.headers.get('content-length', 0))
        if total_size > MAX_DOWNLOAD_SIZE:
            print(f"ERROR: File too large ({total_size / 1024 / 1024:.0f} MB). Max is {MAX_DOWNLOAD_SIZE / 1024 / 1024:.0f} MB.")
            return False
        
        downloaded = 0
        
        with open(output_file, 'wb') as f:
            for chunk in video_response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if downloaded > MAX_DOWNLOAD_SIZE:
                        print(f"\nERROR: Download exceeded size limit. Aborting.")
                        f.close()
                        os.remove(output_file)
                        return False
                    if total_size > 0:
                        progress = (downloaded / total_size) * 100
                        print(f"\rProgress: {progress:.1f}% ({downloaded}/{total_size} bytes)", end='')
        
        print(f"\n✓ Download complete: {output_file}")
        
        # Save metadata
        metadata = {
            'url': url,
            'video_id': video_id,
            'title': title,
            'video_url': video_url,
            'file_size': downloaded
        }
        
        metadata_file = os.path.join(output_dir, f"{title}.info.json")
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Metadata saved: {metadata_file}")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Network error - {e}")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: python mover_downloader.py <video_url> <output_directory>")
        sys.exit(1)
    
    video_url = sys.argv[1]
    output_dir = sys.argv[2]
    
    success = download_mover_video(video_url, output_dir)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
