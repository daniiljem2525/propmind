import { MessageCircle } from "lucide-react";

// Плавающая кнопка чата поддержки → Telegram @arendora_support.
// Ответ ≤1 час: CEO отвечает из приложения Telegram на телефоне.
export default function SupportChatButton() {
  return (
    <a
      href="https://t.me/arendora_support"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#2AABEE] shadow-lg transition-transform hover:scale-110 sm:bottom-6"
      title="Чат поддержки — отвечаем в течение часа"
      aria-label="Чат поддержки"
    >
      <MessageCircle className="h-6 w-6 text-white" fill="currentColor" />
    </a>
  );
}
