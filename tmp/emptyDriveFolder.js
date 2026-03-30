require('dotenv').config();
const axios = require('axios');

const FOLDER_NAME = 'podcast_tts_audio';

async function deleteAllInFolder() {
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
        console.log(`🧹 Emptying folder: ${FOLDER_NAME} (${folderId})`);

        // 2. List all files in that folder
        let files = [];
        let nextPageToken = null;
        
        do {
            const filesRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
                params: {
                    q: `'${folderId}' in parents and trashed=false`,
                    fields: 'nextPageToken, files(id, name)',
                    pageSize: 100,
                    pageToken: nextPageToken
                },
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            files = files.concat(filesRes.data.files);
            nextPageToken = filesRes.data.nextPageToken;
        } while (nextPageToken);

        console.log(`Found ${files.length} items to delete.`);

        // 3. Delete them (Parallel delete for speed)
        const CONCURRENCY = 15;
        let idx = 0;

        const worker = async () => {
            while (idx < files.length) {
                const file = files[idx++];
                if (!file) break;
                try {
                    await axios.delete(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    process.stdout.write('.');
                } catch (e) {
                    console.error(`\nFailed to delete ${file.name}: ${e.message}`);
                }
            }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

        console.log("\n✅ Folder is now empty.");
    } catch (err) {
        console.error("Cleanup failed:", err.response?.data || err.message);
    }
}

deleteAllInFolder();
