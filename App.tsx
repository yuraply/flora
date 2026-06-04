import React, { useState, useCallback } from 'react';
import { Hero } from './components/Hero';
import { LoadingScreen } from './components/LoadingScreen';
import { PlantResult } from './components/PlantResult';
import { identifyPlant } from './services/geminiService';
import { ImageFile, LoadingState, PlantData } from './types';
import { AlertCircle } from 'lucide-react';

import { compressImage } from './utils/imageUtils';

export default function App() {
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [currentImage, setCurrentImage] = useState<ImageFile | null>(null);
  const [plantData, setPlantData] = useState<PlantData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const previewUrl = URL.createObjectURL(file);
      setCurrentImage({ file, previewUrl });
      setErrorMsg(null);
    }
  }, []);



  const handleClearImage = () => {
    setCurrentImage(null);
  };

  const handleSubmit = async () => {
    console.log("handleSubmit called");
    if (!currentImage) {
      console.log("No image, returning");
      return;
    }

    setLoadingState(LoadingState.ANALYZING);
    setErrorMsg(null);

    try {
      let base64String: string | undefined = undefined;

      if (currentImage) {
        console.log("Compressing image...");
        // Compress image before sending
        base64String = await compressImage(currentImage.file);
        console.log("Image compressed, length:", base64String.length);
      }

      console.log("Calling identifyPlant...");
      const data = await identifyPlant("", base64String);
      console.log("identifyPlant returned:", data);
      setPlantData(data);
      setLoadingState(LoadingState.SUCCESS);
    } catch (err: any) {
      console.error("Error in handleSubmit:", err);
      let message = "Не удалось получить ответ.";
      if (err.message) {
        message += ` (${err.message})`;
      }
      setErrorMsg(message);
      setLoadingState(LoadingState.ERROR);
    }
  };

  const handleReset = () => {
    setLoadingState(LoadingState.IDLE);
    setCurrentImage(null);
    setPlantData(null);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-nature-50 font-sans text-gray-900 selection:bg-nature-200">
      <main className="max-w-md mx-auto min-h-screen relative bg-white shadow-2xl overflow-hidden sm:rounded-none sm:min-h-screen md:min-h-screen">

        {loadingState === LoadingState.IDLE && (
          <Hero
            onImageSelect={handleImageSelect}
            onSubmit={handleSubmit}
            selectedImagePreview={currentImage?.previewUrl || null}
            onClearImage={handleClearImage}
          />
        )}

        {loadingState === LoadingState.ANALYZING && (
          <LoadingScreen />
        )}

        {loadingState === LoadingState.SUCCESS && plantData && (
          <PlantResult
            data={plantData}
            imagePreview={currentImage?.previewUrl || "https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"}
            onReset={handleReset}
          />
        )}

        {loadingState === LoadingState.ERROR && (
          <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
            <div className="bg-red-100 p-4 rounded-full mb-4">
              <AlertCircle className="text-red-600 w-12 h-12" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Ой!</h2>
            <p className="text-gray-600 mb-8">{errorMsg || "Что-то пошло не так."}</p>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-nature-600 text-white rounded-xl shadow-lg font-medium"
            >
              Попробовать снова
            </button>
          </div>
        )}
      </main>
    </div>
  );
}