import React from 'react';
import { Camera, Image as ImageIcon, Send, X, Power } from 'lucide-react';

interface HeroProps {
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  selectedImagePreview: string | null;
  onClearImage: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  onImageSelect,
  onSubmit,
  selectedImagePreview,
  onClearImage
}) => {
  // Function to attempt closing the app
  const handleCloseApp = () => {
    try {
      window.close();
      // Fallback for some browsers/PWA implementations
      if (document.referrer === "") {
        window.history.back();
      }
    } catch (e) {
      console.log("Could not close window via JS", e);
    }
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-screen px-6 py-8 bg-nature-50 animate-fade-in font-sans">

      {/* Header / Logo */}
      <div className="flex flex-col items-center mt-4">
        <div className="
          w-28 h-28 rounded-[2rem] mb-6 flex items-center justify-center
          icon-container-3d
        ">
          <img
            src="/icon.png"
            alt="FloraLens Icon"
            className="w-20 h-20 object-contain drop-shadow-md"
          />
        </div>
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight mb-2">FloraLens</h1>
        <p className="text-gray-500 font-medium text-center max-w-[250px]">
          Узнай растение по фото
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-sm my-8">

        {/* Image Preview or Selection Buttons */}
        {selectedImagePreview ? (
          <div className="
            p-5 rounded-[2.5rem]
            bg-nature-50
            shadow-[inset_6px_6px_12px_#d1e9db,inset_-6px_-6px_12px_#ffffff]
            border border-white/50
          ">
            <div className="relative rounded-[2rem] overflow-hidden aspect-square shadow-md mx-auto mb-6">
              <img
                src={selectedImagePreview}
                alt="Selected"
                className="w-full h-full object-cover"
              />
              <button
                onClick={onClearImage}
                className="absolute top-4 right-4 p-2 bg-white/80 text-gray-700 rounded-full backdrop-blur-sm shadow-sm hover:bg-white active:scale-90 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Submit Button */}
            <button
              onClick={onSubmit}
              className="
                w-full py-5 rounded-2xl font-bold text-lg text-white
                flex items-center justify-center gap-3
                btn-action-green
              "
            >
              <Send size={22} className="stroke-[2.5]" />
              <span>РАСПОЗНАТЬ</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <label className="
              flex flex-col items-center justify-center h-40
              rounded-[2rem] cursor-pointer
              btn-apple-3d
            ">
              <div className="text-nature-600 mb-3">
                <Camera size={40} className="stroke-[2]" />
              </div>
              <span className="text-lg font-bold text-gray-700">Сделать фото</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onImageSelect}
              />
            </label>

            <label className="
              flex flex-col items-center justify-center h-40
              rounded-[2rem] cursor-pointer
              btn-apple-3d
            ">
              <div className="text-nature-600 mb-3">
                <ImageIcon size={40} className="stroke-[2]" />
              </div>
              <span className="text-lg font-bold text-gray-700">Из галереи</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onImageSelect}
              />
            </label>
          </div>
        )}

      </div>

      {/* Footer / Exit Button */}
      <div className="mb-6 w-full max-w-sm px-4">
        <button
          onClick={handleCloseApp}
          className="
            flex items-center justify-center gap-3
            w-full py-4 px-6 rounded-2xl
            text-gray-500 hover:text-red-500
            btn-exit-apple
          "
          aria-label="Exit Application"
        >
          <Power size={22} className="stroke-[2.5]" />
          <span className="font-semibold text-base tracking-wide">Выйти</span>
        </button>
      </div>

    </div>
  );
};