require('dotenv').config();
const axios = require('axios');

const FOLDER_NAME = 'podcast_tts_audio';

async function cleanup() {
    const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("GOOGLE_DRIVE_ACCESS_TOKEN missing");
        return;
    }

    try {
        // 1. Find the folder ID
        const folderRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
            params: {
                q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
                fields: 'files(id)'
            },
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (folderRes.data.files.length === 0) {
            console.log("Folder not found. Nothing to clean.");
            return;
        }

        const folderId = folderRes.data.files[0].id;
        console.log(`Cleaning folder: ${FOLDER_NAME} (${folderId})`);

        // 2. List all .mp3 files in that folder
        const filesRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
            params: {
                q: `'${folderId}' in parents and name contains '.mp3' and trashed=false`,
                fields: 'files(id, name)'
            },
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const files = filesRes.data.files;
        console.log(`Found ${files.length} corrupted .mp3 files to delete.`);

        // 3. Delete them
        for (const file of files) {
            console.log(`Deleting: ${file.name} (${file.id})...`);
            await axios.delete(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        }

        console.log("✅ Cleanup complete.");
    } catch (err) {
        console.error("Cleanup failed:", err.response?.data || err.message);
    }
}

cleanup();
