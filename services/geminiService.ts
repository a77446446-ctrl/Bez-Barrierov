
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || 'dummy_key_for_dev' });

export const getSmartRecommendations = async (userRequest: string, executors: any[]) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `User needs: ${userRequest}. Here is a list of available helpers: ${JSON.stringify(executors)}. 
      Recommend the best 2 helpers and explain why in 2 short sentences in Russian. 
      Return the response in a friendly tone.`,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Не удалось получить умные рекомендации в данный момент.";
  }
};
