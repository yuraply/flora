import { fileURLToPath } from 'url';

async function testText() {
    try {
        console.log("Sending text request to http://localhost:9911/api/identify...");
        const response = await fetch('http://localhost:9911/api/identify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: "Помоги, у моего растения желтеют листья. Что купить?",
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

testText();
