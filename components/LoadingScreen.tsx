import React, { useEffect, useState, useRef } from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingScreen: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);
  const startTimeRef = useRef(Date.now());

  // Логически упорядоченные сообщения по этапам обработки
  const messages = [
    // Этап 1: Загрузка и первичный анализ (0-8 сек)
    "📤 Загружаем изображение...",
    "🔍 Анализируем качество фото...",
    "✨ Выделяем ключевые детали...",

    // Этап 2: Распознавание растения (8-20 сек)
    "🌿 Распознаём структуру листьев...",
    "🌸 Анализируем форму и цвет...",
    "🧬 Определяем характерные признаки...",
    "🔬 Сопоставляем с базой растений...",

    // Этап 3: Поиск информации (20-35 сек)
    "📚 Ищем информацию о растении...",
    "🌱 Собираем данные по уходу...",
    "💧 Определяем потребности в поливе...",
    "☀️ Рассчитываем режим освещения...",

    // Этап 4: Финальная подготовка (35+ сек)
    "📝 Формируем рекомендации...",
    "🎯 Готовим результат для вас...",
    "⏳ Почти готово, ещё секунду...",
    "🌺 Завершаем анализ..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => {
        // Показываем каждое сообщение только один раз, 
        // останавливаемся на последнем
        if (prev < messages.length - 1) {
          setFadeKey(k => k + 1); // Триггер анимации
          return prev + 1;
        }
        return prev;
      });
    }, 2500); // 2.5 секунды на каждое сообщение

    return () => clearInterval(interval);
  }, [messages.length]);

  // Определяем прогресс для визуальной индикации
  const progress = Math.min(((messageIndex + 1) / messages.length) * 100, 100);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[80vh]">
      {/* Анимированный загрузчик */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-nature-300 blur-xl opacity-40 rounded-full animate-pulse"></div>
        <div className="relative icon-container-3d p-6 rounded-3xl">
          <Loader2 className="w-14 h-14 text-nature-600 animate-spin" />
        </div>
      </div>

      {/* Заголовок */}
      <h2 className="text-2xl font-bold text-nature-900 mb-4">Определяем растение</h2>

      {/* Прогресс-бар */}
      <div className="w-64 h-2 bg-nature-100 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-nature-400 to-nature-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Сообщение с анимацией */}
      <div className="h-8 flex items-center justify-center">
        <p
          key={fadeKey}
          className="text-nature-600 text-center px-6 fade-message font-medium"
        >
          {messages[messageIndex]}
        </p>
      </div>

      {/* Подсказка */}
      <p className="text-gray-400 text-sm mt-8 text-center px-8">
        Это может занять до 30 секунд
      </p>
    </div>
  );
};