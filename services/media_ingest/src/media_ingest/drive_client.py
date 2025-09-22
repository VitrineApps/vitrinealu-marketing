"""Google Drive API client for media ingestion"""

import io
from pathlib import Path
from typing import List, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from .config import config


class DriveFile:
    """Represents a file from Google Drive"""

    def __init__(self, file_id: str, name: str, modified_time: str, md5_checksum: Optional[str] = None):
        self.id = file_id
        self.name = name
        self.modified_time = modified_time
        self.md5_checksum = md5_checksum


class DriveClient:
    """Google Drive API client using service account authentication"""

    def __init__(self, creds_path: Optional[str] = None):
        creds_path = creds_path or config.google_creds_path
        credentials = service_account.Credentials.from_service_account_file(creds_path)
        self.service = build('drive', 'v3', credentials=credentials)

    def list_images(self, folder_id: str, modified_after: Optional[str] = None) -> List[DriveFile]:
        """List image files in a folder, optionally filtered by modification time"""
        query_parts = [
            f"'{folder_id}' in parents",
            "mimeType contains 'image/'",
            "trashed = false"
        ]

        if modified_after:
            query_parts.append(f"modifiedTime > '{modified_after}'")

        query = " and ".join(query_parts)

        files = []
        page_token = None

        while True:
            results = self.service.files().list(
                q=query,
                fields="nextPageToken,files(id,name,modifiedTime,md5Checksum,mimeType)",
                pageToken=page_token
            ).execute()

            for file_data in results.get('files', []):
                files.append(DriveFile(
                    file_id=file_data['id'],
                    name=file_data['name'],
                    modified_time=file_data['modifiedTime'],
                    md5_checksum=file_data.get('md5Checksum')
                ))

            page_token = results.get('nextPageToken')
            if not page_token:
                break

        return files

    def download_file(self, file_id: str, dest_path: Path) -> None:
        """Download a file from Google Drive to local path"""
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        request = self.service.files().get_media(fileId=file_id)
        with open(dest_path, 'wb') as f:
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                status, done = downloader.next_chunk()
                if status:
                    print(f"Download {int(status.progress() * 100)}%.")

    def get_file_metadata(self, file_id: str) -> dict:
        """Get file metadata"""
        return self.service.files().get(fileId=file_id, fields="*").execute()