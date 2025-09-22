"""Command line interface for Media Ingest Service"""

import argparse
import glob
import signal
import sys
import time
from pathlib import Path

from .config import config
from .drive_client import DriveClient
from .nas_watcher import NASWatcher
from .pipeline import pipeline


class CLI:
    """Command Line Interface for media ingestion"""

    def __init__(self):
        self.parser = argparse.ArgumentParser(
            description="Media Ingest Service for VitrineAlu Marketing"
        )
        self.subparsers = self.parser.add_subparsers(dest='command', help='Available commands')

        self._setup_parsers()

    def _setup_parsers(self):
        """Setup argument parsers for each command"""

        # sync-gdrive
        sync_parser = self.subparsers.add_parser(
            'sync-gdrive',
            help='Sync images from Google Drive folder'
        )
        sync_parser.add_argument(
            '--folder-id',
            required=True,
            help='Google Drive folder ID to sync from'
        )
        sync_parser.add_argument(
            '--modified-after',
            help='Only sync files modified after this ISO datetime'
        )

        # watch-nas
        watch_parser = self.subparsers.add_parser(
            'watch-nas',
            help='Watch NAS directories for new files'
        )

        # run-once
        run_parser = self.subparsers.add_parser(
            'run-once',
            help='Process a single file or directory'
        )
        run_parser.add_argument(
            'path',
            help='Path to file or directory to process'
        )
        run_parser.add_argument(
            '--source',
            default='manual',
            help='Source identifier for processed files'
        )

        # reprocess
        reprocess_parser = self.subparsers.add_parser(
            'reprocess',
            help='Reprocess files matching a glob pattern'
        )
        reprocess_parser.add_argument(
            'pattern',
            help='Glob pattern to match files for reprocessing'
        )
        reprocess_parser.add_argument(
            '--source',
            default='reprocess',
            help='Source identifier for processed files'
        )

        # stats
        stats_parser = self.subparsers.add_parser(
            'stats',
            help='Show processing statistics'
        )

    def run(self):
        """Run the CLI"""
        args = self.parser.parse_args()

        if not args.command:
            self.parser.print_help()
            return

        # Dispatch to command handler
        command_method = getattr(self, f'cmd_{args.command}', None)
        if command_method:
            command_method(args)
        else:
            print(f"Unknown command: {args.command}")

    def cmd_sync_gdrive(self, args):
        """Sync from Google Drive"""
        print("Syncing from Google Drive...")

        client = DriveClient()
        files = client.list_images(args.folder_id, args.modified_after)

        print(f"Found {len(files)} images to process")

        file_paths = []
        for drive_file in files:
            # Download to temp
            temp_path = Path(config.temp_dir) / f"drive_{drive_file.id}_{drive_file.name}"
            try:
                client.download_file(drive_file.id, temp_path)
                file_paths.append(temp_path)
            except Exception as e:
                print(f"Failed to download {drive_file.name}: {e}")

        # Process batch
        processed = pipeline.process_batch(file_paths, source='gdrive')

        # Cleanup temp files
        for path in file_paths:
            if path.exists():
                path.unlink()

        print(f"Processed {len(processed)} files from Google Drive")

    def cmd_watch_nas(self, args):
        """Watch NAS directories"""
        print("Starting NAS watcher...")

        def on_new_file(file_path: Path):
            print(f"New file detected: {file_path}")
            pipeline.process_file(file_path, source='nas')

        watcher = NASWatcher(config.nas_paths, on_new_file)

        def signal_handler(sig, frame):
            print("Stopping NAS watcher...")
            watcher.stop()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)

        try:
            watcher.start()
            print("NAS watcher running. Press Ctrl+C to stop.")
            while watcher.is_alive():
                time.sleep(1)
        except KeyboardInterrupt:
            watcher.stop()

    def cmd_run_once(self, args):
        """Process a single file or directory"""
        path = Path(args.path)

        if path.is_file():
            result = pipeline.process_file(path, args.source)
            if result:
                print(f"Processed: {path} -> {result}")
            else:
                print(f"Skipped or failed: {path}")
        elif path.is_dir():
            files = list(path.glob("**/*"))
            image_files = [f for f in files if f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.bmp'}]
            processed = pipeline.process_batch(image_files, args.source)
            print(f"Processed {len(processed)} files from {path}")
        else:
            print(f"Path not found: {path}")

    def cmd_reprocess(self, args):
        """Reprocess files matching pattern"""
        files = []
        for pattern in args.pattern.split():
            files.extend(glob.glob(pattern))

        image_files = [Path(f) for f in files if Path(f).suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.bmp'}]

        print(f"Found {len(image_files)} files to reprocess")

        processed = pipeline.process_batch(image_files, args.source)
        print(f"Reprocessed {len(processed)} files")

    def cmd_stats(self, args):
        """Show processing statistics"""
        import sqlite3

        try:
            with sqlite3.connect(config.processed_db_path) as conn:
                cursor = conn.cursor()

                # Total processed
                cursor.execute("SELECT COUNT(*) FROM processed")
                total = cursor.fetchone()[0]

                # By source
                cursor.execute("SELECT source, COUNT(*) FROM processed GROUP BY source")
                by_source = cursor.fetchall()

                # Recent processing
                cursor.execute("SELECT COUNT(*) FROM processed WHERE processed_at > datetime('now', '-24 hours')")
                recent = cursor.fetchone()[0]

                print("Media Ingest Statistics:")
                print(f"Total processed files: {total}")
                print(f"Processed in last 24h: {recent}")
                print("By source:")
                for source, count in by_source:
                    print(f"  {source}: {count}")

        except sqlite3.Error as e:
            print(f"Database error: {e}")


def main():
    """Main entry point"""
    cli = CLI()
    cli.run()


if __name__ == "__main__":
    main()