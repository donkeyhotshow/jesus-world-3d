import { Button } from "@/components/ui/button";
import { Link } from "wouter";

/**
 * Jesus World: Ultimate Revelation - Landing Page
 * Main entry point for the game
 */
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-amber-950 via-black to-black">
      <main className="text-center p-8">
        {/* Title */}
        <div className="mb-4">
          <h1 className="text-5xl md:text-6xl font-black tracking-widest text-amber-400 font-serif" style={{ textShadow: "0 0 48px rgba(200,168,75,0.45)" }}>
            + ИИСУС БЬЁТ +
          </h1>
          <p className="text-white/85 text-lg mt-3 font-sans max-w-md mx-auto">
            Мочи грешников молниями и рыбой
          </p>
        </div>

        {/* Description */}
        <p className="text-gray-500 max-w-md mx-auto mb-8 font-serif text-sm">
          Волны демонов, святые способности, камера сзади.
        </p>

        {/* Play Button */}
        <div className="mb-8">
          <Link href="/game">
            <Button className="bg-gradient-to-br from-amber-500 to-amber-700 text-black font-bold py-4 px-12 rounded tracking-widest hover:scale-105 transition-transform text-lg">
              ИГРАТЬ
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
          <div className="bg-black/40 border border-amber-600/30 rounded-lg p-4">
            <div className="text-amber-500 text-2xl mb-2">⚡</div>
            <h3 className="text-amber-500 font-bold mb-1 font-serif">8 Способностей</h3>
            <p className="text-gray-500 text-sm font-serif">Смайт, рыба, вино, потоп, благодать и другие святые атаки</p>
          </div>
          <div className="bg-black/40 border border-amber-600/30 rounded-lg p-4">
            <div className="text-amber-500 text-2xl mb-2">👹</div>
            <h3 className="text-amber-500 font-bold mb-1 font-serif">6 Типов Врагов</h3>
            <p className="text-gray-500 text-sm font-serif">Грешники, демоны, огненные, архидемоны, легионы и сам Сатана</p>
          </div>
          <div className="bg-black/40 border border-amber-600/30 rounded-lg p-4">
            <div className="text-amber-500 text-2xl mb-2">🌊</div>
            <h3 className="text-amber-500 font-bold mb-1 font-serif">Волны</h3>
            <p className="text-gray-500 text-sm font-serif">Бесконечные волны с нарастающей сложностью и боссами</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 text-gray-500 text-sm font-serif">
          <p>WASD — движение | Мышь — камера и прицел</p>
          <p>ЛКМ — Смайт | ПКМ — Рыба | Q — Вино | R — Потоп</p>
          <p>Space — прыжок | Shift — полёт</p>
        </div>
      </main>
    </div>
  );
}
