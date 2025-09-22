"""NAS directory watcher using watchdog for file system events"""

import threading
import time
from pathlib import Path
from typing import Callable, List

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .config import config


class NASHandler(FileSystemEventHandler):
    """File system event handler with debouncing for NAS watching"""

    def __init__(self, callback: Callable[[Path], None], debounce_seconds: float = 1.0):
        self.callback = callback
        self.debounce_seconds = debounce_seconds
        self.pending_events = {}
        self.lock = threading.Lock()

    def on_created(self, event):
        if not event.is_directory and self._is_image_file(event.src_path):
            self._debounce_event(Path(event.src_path))

    def on_modified(self, event):
        if not event.is_directory and self._is_image_file(event.src_path):
            self._debounce_event(Path(event.src_path))

    def _is_image_file(self, path: str) -> bool:
        """Check if file is an image based on extension"""
        image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'}
        return Path(path).suffix.lower() in image_extensions

    def _debounce_event(self, path: Path):
        """Debounce events for the same file"""
        with self.lock:
            # Cancel existing timer for this path
            if path in self.pending_events:
                self.pending_events[path].cancel()

            # Create new timer
            timer = threading.Timer(self.debounce_seconds, self._trigger_callback, args=[path])
            self.pending_events[path] = timer
            timer.start()

    def _trigger_callback(self, path: Path):
        """Trigger the callback and clean up"""
        with self.lock:
            if path in self.pending_events:
                del self.pending_events[path]
        self.callback(path)


class NASWatcher:
    """NAS directory watcher with recursive monitoring"""

    def __init__(self, paths: List[str], callback: Callable[[Path], None]):
        self.paths = [Path(p) for p in paths]
        self.callback = callback
        self.observer = Observer()
        self.handler = NASHandler(callback)

        # Schedule watching for each path
        for path in self.paths:
            if path.exists():
                self.observer.schedule(self.handler, str(path), recursive=True)
            else:
                print(f"Warning: NAS path {path} does not exist")

    def start(self):
        """Start watching"""
        self.observer.start()
        print(f"Started watching NAS paths: {[str(p) for p in self.paths]}")

    def stop(self):
        """Stop watching"""
        self.observer.stop()
        self.observer.join()
        print("Stopped NAS watching")

    def is_alive(self) -> bool:
        """Check if watcher is running"""
        return self.observer.is_alive()