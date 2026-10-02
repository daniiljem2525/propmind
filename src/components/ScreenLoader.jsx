// Индикатор загрузки экрана: общая заглушка для ленивых страниц
// и ожидания восстановления сессии.
export default function ScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
