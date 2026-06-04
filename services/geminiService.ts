import { PlantData } from "../types";



export const identifyPlant = async (text?: string, base64Image?: string): Promise<PlantData> => {
  try {
    const response = await fetch('/api/identify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, base64Image }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data as PlantData;
  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
};