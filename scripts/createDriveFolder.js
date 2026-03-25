/**
 * createDriveFolder-simple.js
 * 
 * Creates a folder and outputs only the ID.
 */
require('dotenv').config();

const getAccessToken = async () => {
    // Prefer direct access token if refresh fails
    if (process.env.GOOGLE_DRIVE_ACCESS_TOKEN) return process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

    if (refreshToken && clientId && clientSecret) {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId, client_secret: clientSecret,
                refresh_token: refreshToken, grant_type: 'refresh_token'
            })
        });
        const data = await res.json();
        if (res.ok && data.access_token) return data.access_token;
    }
    throw new Error('No valid token.');
};

async function createFolder() {
    const accessToken = await getAccessToken();
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: "NEETFORGE-Question-Images", mimeType: "application/vnd.google-apps.folder" })
    });
    const data = await res.json();
    if (data.id) {
        console.log(`FOLDER_ID=${data.id}`);
        // Public permission
        await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
    }
}
createFolder().catch(err => console.log(err.message));
