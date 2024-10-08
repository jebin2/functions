require('dotenv').config();
const { OAuth2Client } = require('google-auth-library'); // Correct import
const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
const { google } = require('googleapis');
const FILE_NAME = "cardholder.json";

async function getDriveObject(response) {
    let drive;
    try {
        oauth2Client.setCredentials({
            access_token: response.access_token,
            refresh_token: response.refresh_token,
        });
        drive = google.drive({ version: 'v3', auth: oauth2Client });
        console.log("getCardHolderData :: drive object generated");
    } catch (error) {
        console.warn("getCardHolderData :: token expirted, trying to generate with refresh token " + error.message);
        if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
            response = await oauth2Client.refreshToken(response.refreshToken);
            console.log("getCardHolderData :: token successfully generated with refresh token");
            delete response.res;
            oauth2Client.setCredentials({
                access_token: response.tokens.access_token,
                refresh_token: response.tokens.refresh_token,
            });
            drive = google.drive({ version: 'v3', auth: oauth2Client });
            console.log("getCardHolderData :: drive object generated with refresh token");
        } else {
            throw error;
        }
    } finally {
        if (!drive) {
            throw ("getCardHolderData :: error in generating token.");
        }
        return drive;
    }
}

async function createAppDataFile(drive) {
    try {
        let isFileAlreadyExists = await isAppDataFileExists(drive);
        if (isFileAlreadyExists) {
            console.warn("createAppDataFile :: file already exists.");
            return true;
        }

        await drive.files.create({
            resource: {
                name: FILE_NAME,
                parents: ['appDataFolder'] // Place it in the appDataFolder
            },
            media: {
                mimeType: 'application/json',
                body: JSON.stringify([])
            },
            fields: 'id'
        });

        console.warn("createAppDataFile :: file created successfully.");
        return true;
    } catch (error) {
        console.error('createAppDataFile :: ' + error.message);
        throw error;
    }
}

async function isAppDataFileExists(drive) {
    try {
        const res = await drive.files.list({
            spaces: 'appDataFolder',
            fields: 'files(id, name)',
        });
        const file = res.data.files.find(file => file.name === FILE_NAME);
        return !!file;
    } catch (error) {
        console.error("isAppDataFileExists :: " + error.message);
        throw error;
    }
}

async function getAppDataFile(drive) {
    try {
        const res = await drive.files.list({
            spaces: 'appDataFolder',
            fields: 'files(id, name)',
        });

        const file = res.data.files.find(file => file.name === FILE_NAME);

        if (!file) {
            console.error("getAppDataFile :: file not found.");
            throw new Error("getAppDataFile :: file not found.");
        }

        const fileContent = await drive.files.get({
            fileId: file.id,
            alt: 'media', // Get the file content directly
        });

        console.log("getAppDataFile :: file retrieved successfully.");

        return {
            id: file.id,
            content: fileContent.data.filter(x => !x.is_deleted)
        };
    } catch (error) {
        console.error("getAppDataFile :: " + error.message);
        throw error;
    }
}

async function updateAppDataFile(drive, newFileContent = []) {
    try {
        const file = await getAppDataFile(drive);
        newFileContent = mergeArraysByKey(file.content, newFileContent, "key");
        newFileContent.forEach(item => {
            item.is_synced = true;
        });
        await drive.files.update({
            fileId: file.id,
            media: {
                mimeType: 'application/json',
                body: JSON.stringify(newFileContent)
            },
            fields: 'id'
        });
        console.log('updateAppDataFile :: file updated successfully');
        return true;
    } catch (error) {
        console.error('updateAppDataFile :: ' + error.message);
        throw error;
    }
}

function mergeArraysByKey(oldData, newData) {
    let finalDataMap = new Map();
    oldData.forEach(item => {
        finalDataMap.set(item.key, item);
    });

    newData.forEach(item => {
        if (finalDataMap.has(item.key)) {
            let existingItem = finalDataMap.get(item.key);
            if (item.last_modified_time > existingItem.last_modified_time) {
                finalDataMap.set(item.key, item);
            }
        } else {
            finalDataMap.set(item.key, item);
        }
    });

    return Array.from(finalDataMap.values());
}
module.exports = { getDriveObject, createAppDataFile, getAppDataFile, updateAppDataFile };