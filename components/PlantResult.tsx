import React from 'react';
import { PlantData } from '../types';
import { Droplets, Sun, Thermometer, Shovel, Info, ArrowLeft, HeartPulse, Power } from 'lucide-react';

interface PlantResultProps {
  data: PlantData;
  imagePreview: string;
  onReset: () => void;
}

export const PlantResult: React.FC<PlantResultProps> = ({ data, imagePreview, onReset }) => {

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'ЛЕГКО';
      case 'Medium': return 'СРЕДНЕ';
      case 'Hard': return 'СЛОЖНО';
      default: return difficulty;
    }
  };

  if (!data.isPlant) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
        <div className="bg-red-50 p-6 rounded-full mb-6">
          <Info size={48} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Не растение?</h2>
        <p className="text-gray-600 mb-8">
          Мы не смогли распознать растение на этом изображении. Пожалуйста, попробуйте сделать фото ближе или при лучшем освещении.
        </p>
        <button
          onClick={onReset}
          className="px-8 py-3 bg-nature-600 text-white rounded-xl shadow-lg font-medium active:scale-95 transition-transform"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div className="pb-12 animate-fade-in relative">
      {/* Header Image with Gradient Overlay */}
      <div className="relative h-72 w-full overflow-hidden rounded-b-[2.5rem] shadow-xl">
        <img
          src={imagePreview && !imagePreview.includes("unsplash") ? imagePreview : (data.image_url || imagePreview)}
          alt={data.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30"></div>

        <button
          onClick={onReset}
          className="absolute top-6 left-6 p-2 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/30 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="absolute bottom-6 left-6 right-6">
          <h1 className="text-3xl font-serif text-white font-bold leading-tight shadow-sm">
            {data.name}
          </h1>
          <p className="text-nature-100 italic font-medium text-lg mt-1 opacity-90">
            {data.scientificName}
          </p>
        </div>
      </div>

      <div className="px-6 mt-8 space-y-8">

        {/* Description */}
        <div className="card-neumorphic p-6 rounded-3xl">
          <p className="text-gray-700 leading-relaxed text-lg">
            {data.description}
          </p>
        </div>

        {/* Care Grid - The Infographic Part */}
        <div>
          <h2 className="text-xl font-bold text-nature-900 mb-4 flex items-center gap-2">
            Уход за растением
          </h2>
          <div className="grid grid-cols-2 gap-4">

            {/* Water */}
            <div className="card-care-water p-5 rounded-2xl">
              <div className="flex items-center gap-3 mb-2 text-blue-700">
                <div className="bg-white/80 p-2 rounded-full shadow-sm">
                  <Droplets size={20} />
                </div>
                <span className="font-bold text-sm uppercase tracking-wider">Полив</span>
              </div>
              <p className="text-blue-900 font-medium text-sm leading-snug">
                {data.care.water}
              </p>
            </div>

            {/* Light */}
            <div className="card-care-light p-5 rounded-2xl">
              <div className="flex items-center gap-3 mb-2 text-amber-700">
                <div className="bg-white/80 p-2 rounded-full shadow-sm">
                  <Sun size={20} />
                </div>
                <span className="font-bold text-sm uppercase tracking-wider">Свет</span>
              </div>
              <p className="text-amber-900 font-medium text-sm leading-snug">
                {data.care.light}
              </p>
            </div>

            {/* Soil */}
            <div className="card-care-soil p-5 rounded-2xl">
              <div className="flex items-center gap-3 mb-2 text-stone-700">
                <div className="bg-white/80 p-2 rounded-full shadow-sm">
                  <Shovel size={20} />
                </div>
                <span className="font-bold text-sm uppercase tracking-wider">Почва</span>
              </div>
              <p className="text-stone-900 font-medium text-sm leading-snug">
                {data.care.soil}
              </p>
            </div>

            {/* Temp */}
            <div className="card-care-temp p-5 rounded-2xl">
              <div className="flex items-center gap-3 mb-2 text-orange-700">
                <div className="bg-white/80 p-2 rounded-full shadow-sm">
                  <Thermometer size={20} />
                </div>
                <span className="font-bold text-sm uppercase tracking-wider">Темп.</span>
              </div>
              <p className="text-orange-900 font-medium text-sm leading-snug">
                {data.care.temperature}
              </p>
            </div>
          </div>
        </div>

        {/* Difficulty Badge */}
        <div className="flex justify-center">
          <div className={`
                px-6 py-2 rounded-full font-bold text-sm tracking-wide badge-difficulty
                ${data.care.difficulty === 'Easy' ? 'bg-green-100 text-green-800' : ''}
                ${data.care.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' : ''}
                ${data.care.difficulty === 'Hard' ? 'bg-red-100 text-red-800' : ''}
            `}>
            СЛОЖНОСТЬ: {getDifficultyLabel(data.care.difficulty)}
          </div>
        </div>

        {/* Health & Treatment Section */}
        {data.health && (
          <div className={`p-6 rounded-3xl ${data.health.status === 'Healthy' ? 'card-health-good' : 'card-health-bad'}`}>
            <h3 className={`text-xl font-bold mb-4 flex items-center gap-2 ${data.health.status === 'Healthy' ? 'text-green-800' : 'text-red-800'}`}>
              {data.health.status === 'Healthy' ? '🌿 Растение здорово!' : '⚠️ Обнаружены проблемы'}
            </h3>

            {data.health.issues.length > 0 && (
              <div className="mb-4">
                <h4 className="font-bold text-gray-700 mb-2">Симптомы:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {data.health.issues.map((issue, idx) => (
                    <li key={idx} className="text-gray-600">{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.treatment && (
              <div className="mb-4">
                <h4 className="font-bold text-gray-700 mb-2">Рекомендации по уходу/лечению:</h4>
                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{data.treatment}</p>
              </div>
            )}

            {data.ozon_search_term && (
              <a
                href={`https://www.ozon.ru/search/?text=${encodeURIComponent(data.ozon_search_term)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block w-full py-3 btn-ozon text-white font-bold text-center rounded-xl"
              >
                Купить необходимое на Ozon 🛍️
              </a>
            )}
          </div>
        )}

        {/* Did you know? */}
        <div className="card-facts text-white p-6 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 19h20L12 2zm0 3.8L17.6 17H6.4L12 5.8z" /></svg>
          </div>
          <h3 className="text-lg font-bold mb-4 font-serif text-nature-200 border-b border-nature-700 pb-2 inline-block">
            Знаете ли вы?
          </h3>
          <ul className="space-y-3 relative z-10">
            {data.funFacts.map((fact, idx) => (
              <li key={idx} className="flex gap-3 text-nature-100 text-sm">
                <span className="text-nature-400 font-bold">•</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>

        {/* Exit Button */}
        <div className="mt-4">
          <button
            onClick={() => {
              try {
                window.close();
                if (document.referrer === "") {
                  window.history.back();
                }
              } catch (e) {
                console.log("Could not close window", e);
              }
            }}
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

        <div className="h-8"></div> {/* Spacer */}
      </div>
    </div>
  );
};