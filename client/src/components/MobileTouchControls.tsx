import { useEffect, useRef, useState, useCallback } from 'react';

interface MobileTouchControlsProps {
  onMove: (dx: number, dz: number) => void;
  onLook: (dx: number, dy: number) => void;
  onAbility: (ability: string) => void;
  onAttack: (button: number) => void;
  gameStatus: 'menu' | 'playing' | 'paused' | 'dead' | 'gameover';
  cooldowns: number[];
  wave: number;
}

export default function MobileTouchControls({
  onMove,
  onLook,
  onAbility,
  onAttack,
  gameStatus,
  cooldowns,
  wave,
}: MobileTouchControlsProps) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const lookAreaRef = useRef<HTMLDivElement>(null);
  
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickTouchId = useRef<number | null>(null);
  const lookTouchId = useRef<number | null>(null);
  const lastLookPos = useRef({ x: 0, y: 0 });
  
  const JOYSTICK_RADIUS = 50;
  const LOOK_SENSITIVITY = 0.004;

  // Joystick movement
  const handleJoystickStart = useCallback((e: React.TouchEvent) => {
    if (joystickTouchId.current !== null) return;
    
    const touch = e.changedTouches[0];
    joystickTouchId.current = touch.identifier;
    setJoystickActive(true);
    
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    updateJoystickPosition(touch.clientX - centerX, touch.clientY - centerY);
  }, []);

  const updateJoystickPosition = useCallback((rawX: number, rawY: number) => {
    const distance = Math.sqrt(rawX * rawX + rawY * rawY);
    const clampedDistance = Math.min(distance, JOYSTICK_RADIUS);
    const angle = Math.atan2(rawY, rawX);
    
    const x = Math.cos(angle) * clampedDistance;
    const y = Math.sin(angle) * clampedDistance;
    
    setJoystickPos({ x, y });
    
    // Normalize to -1 to 1
    const normalizedX = x / JOYSTICK_RADIUS;
    const normalizedY = -y / JOYSTICK_RADIUS; // Invert Y for game coordinates
    
    onMove(normalizedX, normalizedY);
  }, [onMove]);

  const handleJoystickMove = useCallback((e: React.TouchEvent) => {
    if (joystickTouchId.current === null) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId.current) {
        const rect = joystickRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        updateJoystickPosition(touch.clientX - centerX, touch.clientY - centerY);
        break;
      }
    }
  }, [updateJoystickPosition]);

  const handleJoystickEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId.current) {
        joystickTouchId.current = null;
        setJoystickActive(false);
        setJoystickPos({ x: 0, y: 0 });
        onMove(0, 0);
        break;
      }
    }
  }, [onMove]);

  // Look/camera control
  const handleLookStart = useCallback((e: React.TouchEvent) => {
    if (lookTouchId.current !== null) return;
    
    const touch = e.changedTouches[0];
    lookTouchId.current = touch.identifier;
    lastLookPos.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleLookMove = useCallback((e: React.TouchEvent) => {
    if (lookTouchId.current === null) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId.current) {
        const dx = touch.clientX - lastLookPos.current.x;
        const dy = touch.clientY - lastLookPos.current.y;
        
        lastLookPos.current = { x: touch.clientX, y: touch.clientY };
        
        onLook(dx * LOOK_SENSITIVITY, dy * LOOK_SENSITIVITY);
        break;
      }
    }
  }, [onLook]);

  const handleLookEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId.current) {
        lookTouchId.current = null;
        break;
      }
    }
  }, []);

  // Ability button press
  const handleAbilityPress = useCallback((ability: string) => {
    onAbility(ability);
  }, [onAbility]);

  // Attack buttons
  const handleAttackPress = useCallback((button: number) => {
    onAttack(button);
  }, [onAttack]);

  // Don't show controls unless playing
  if (gameStatus !== 'playing') return null;

  const abilities = [
    { key: 'Q', icon: '🍷', index: 2 },
    { key: 'E', icon: '✋', index: 3 },
    { key: 'R', icon: '🌊', index: 4 },
    { key: 'F', icon: '🍞', index: 5, unlockWave: 5 },
    { key: 'G', icon: '☀', index: 6, unlockWave: 10 },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none z-40 select-none touch-none">
      {/* Look area - right side of screen, invisible but catches touch */}
      <div
        ref={lookAreaRef}
        className="absolute top-0 right-0 w-1/2 h-full pointer-events-auto"
        onTouchStart={handleLookStart}
        onTouchMove={handleLookMove}
        onTouchEnd={handleLookEnd}
        onTouchCancel={handleLookEnd}
      />
      
      {/* Joystick - bottom left */}
      <div
        ref={joystickRef}
        className="absolute bottom-32 left-6 w-32 h-32 pointer-events-auto"
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
        onTouchCancel={handleJoystickEnd}
      >
        {/* Joystick base */}
        <div className="absolute inset-0 rounded-full bg-black/50 border-2 border-amber-600/60 backdrop-blur-sm">
          {/* Direction indicators */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-amber-500/40 text-xs">W</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-amber-500/40 text-xs">S</div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-500/40 text-xs">A</div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500/40 text-xs">D</div>
        </div>
        
        {/* Joystick knob */}
        <div
          ref={joystickKnobRef}
          className={`absolute w-14 h-14 rounded-full transition-colors duration-100 ${
            joystickActive 
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30' 
              : 'bg-gradient-to-br from-amber-600/80 to-amber-800/80'
          } border-2 border-amber-400/80`}
          style={{
            left: `calc(50% - 28px + ${joystickPos.x}px)`,
            top: `calc(50% - 28px + ${joystickPos.y}px)`,
          }}
        >
          <div className="absolute inset-2 rounded-full bg-amber-300/20" />
        </div>
      </div>

      {/* Jump button - bottom center-left */}
      <button
        type="button"
        className="absolute bottom-32 left-44 w-16 h-16 rounded-full bg-black/50 border-2 border-amber-600/60 backdrop-blur-sm pointer-events-auto active:bg-amber-600/40 active:scale-95 transition-all flex items-center justify-center"
        onTouchStart={() => handleAbilityPress('Space')}
      >
        <span className="text-amber-400 text-xl font-bold">↑</span>
        <span className="absolute -bottom-5 text-amber-500/60 text-[10px]">ПРЫЖОК</span>
      </button>

      {/* Flight button (Shift) - above jump */}
      <button
        type="button"
        className="absolute bottom-52 left-44 w-14 h-14 rounded-full bg-black/50 border-2 border-cyan-600/60 backdrop-blur-sm pointer-events-auto active:bg-cyan-600/40 active:scale-95 transition-all flex items-center justify-center"
        onTouchStart={() => handleAbilityPress('ShiftDown')}
        onTouchEnd={() => handleAbilityPress('ShiftUp')}
        onTouchCancel={() => handleAbilityPress('ShiftUp')}
      >
        <span className="text-cyan-400 text-lg">✞</span>
        <span className="absolute -bottom-5 text-cyan-500/60 text-[10px]">ПОЛЁТ</span>
      </button>

      {/* Attack buttons - bottom right */}
      <div className="absolute bottom-32 right-6 flex gap-3 pointer-events-auto">
        {/* LMB - Smite */}
        <button
          type="button"
          className={`w-18 h-18 rounded-full border-2 backdrop-blur-sm flex flex-col items-center justify-center transition-all active:scale-95 ${
            cooldowns[0] <= 0 
              ? 'bg-amber-600/60 border-amber-400 active:bg-amber-500/80' 
              : 'bg-gray-700/60 border-gray-500/60'
          }`}
          style={{ width: 72, height: 72 }}
          onTouchStart={() => handleAttackPress(0)}
        >
          <span className="text-2xl">⚡</span>
          <span className="text-[10px] text-amber-200 mt-0.5">МОЛНИЯ</span>
        </button>

        {/* RMB - Fish */}
        <button
          type="button"
          className={`w-18 h-18 rounded-full border-2 backdrop-blur-sm flex flex-col items-center justify-center transition-all active:scale-95 ${
            cooldowns[1] <= 0 
              ? 'bg-blue-600/60 border-blue-400 active:bg-blue-500/80' 
              : 'bg-gray-700/60 border-gray-500/60'
          }`}
          style={{ width: 72, height: 72 }}
          onTouchStart={() => handleAttackPress(2)}
        >
          <span className="text-2xl">🐟</span>
          <span className="text-[10px] text-blue-200 mt-0.5">РЫБА</span>
        </button>
      </div>

      {/* Ability buttons - right side, vertical */}
      <div className="absolute bottom-52 right-6 flex flex-col gap-2 pointer-events-auto">
        {abilities.map((ability) => {
          const locked = ability.unlockWave && wave < ability.unlockWave;
          const onCooldown = cooldowns[ability.index] > 0;
          
          return (
            <button
              key={ability.key}
              type="button"
              disabled={locked}
              className={`w-14 h-14 rounded-xl border-2 backdrop-blur-sm flex flex-col items-center justify-center transition-all active:scale-95 ${
                locked 
                  ? 'bg-gray-800/60 border-gray-600/40 opacity-50' 
                  : onCooldown 
                    ? 'bg-gray-700/60 border-gray-500/60' 
                    : 'bg-amber-700/60 border-amber-500 active:bg-amber-600/80'
              }`}
              onTouchStart={() => !locked && handleAbilityPress(ability.key)}
            >
              <span className={`text-lg ${locked ? 'grayscale opacity-50' : ''}`}>{ability.icon}</span>
              <span className={`text-[9px] ${locked ? 'text-gray-500' : onCooldown ? 'text-gray-400' : 'text-amber-300'}`}>
                {locked ? `В${ability.unlockWave}` : onCooldown ? `${Math.ceil(cooldowns[ability.index])}с` : ability.key}
              </span>
            </button>
          );
        })}
      </div>

      {/* Pause button - top right */}
      <button
        type="button"
        className="absolute top-3 right-3 w-11 h-11 rounded-lg bg-black/60 border border-amber-600/40 backdrop-blur-sm pointer-events-auto active:bg-amber-600/30 transition-all flex items-center justify-center"
        onTouchStart={() => handleAbilityPress('Escape')}
      >
        <span className="text-amber-400 text-lg">⏸</span>
      </button>
    </div>
  );
}
