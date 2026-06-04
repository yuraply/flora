import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const photoPath = path.join(__dirname, 'photo.jpg');

async function testUpload() {
    try {
        console.log("Reading photo...");
        const buffer = fs.readFileSync(photoPath);
        const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        console.log("Photo read and converted to base64.");

        console.log("Sending request to http://localhost:9911/api/identify...");
        const response = await fetch('http://localhost:9911/api/identify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: "What is this?",
                base64Image: base64Image
            }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Response received:");
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error("Test failed:", error);
    }
}

testUpload();
