"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ============== TYPES ==============
interface Car {
  id: number;
  x: number;
  y: number;
  angle: number; // radians
  speed: number;
  color: string;
  name: string;
  controls: {
    up: string;
    down: string;
    left: string;
    right: string;
  };
  lap: number;
  progress: number; // 0..1 around the track + laps
  finished: boolean;
  eliminated: boolean;
  isAI?: boolean;
}

interface TrackPoint {
  x: number;
  y: number;
}

// ============== WORLD / TRACK (much bigger) ==============
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1600;
const CANVAS_WIDTH = 1100;
const CANVAS_HEIGHT = 700;

const CAR_WIDTH = 32;
const CAR_HEIGHT = 16;
const MAX_SPEED = 7.2;
const ACCELERATION = 0.22;
const FRICTION = 0.965;
const TURN_SPEED = 0.058;
const AI_TURN_SPEED = 0.045;
// How far behind the leader (in laps) before you're eliminated
const MAX_LAG_LAPS = 0.75;

// Bigger oval track
const TRACK_POINTS = 96;
const TRACK_CENTER: TrackPoint[] = (() => {
  const points: TrackPoint[] = [];
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  const rx = 900;
  const ry = 560;
  for (let i = 0; i < TRACK_POINTS; i++) {
    const a = (i / TRACK_POINTS) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(a) * rx,
      y: cy + Math.sin(a) * ry,
    });
  }
  return points;
})();

function getWalls(offset: number): TrackPoint[] {
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  const rx = 900 + offset;
  const ry = 560 + offset;
  const points: TrackPoint[] = [];
  for (let i = 0; i < TRACK_POINTS; i++) {
    const a = (i / TRACK_POINTS) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(a) * rx,
      y: cy + Math.sin(a) * ry,
    });
  }
  return points;
}

const OUTER_WALL = getWalls(95);
const INNER_WALL = getWalls(-95);
const TRACK_WIDTH = 190; // approx

// ============== HELPERS ==============
function dist(a: TrackPoint, b: TrackPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointInPolygon(x: number, y: number, poly: TrackPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isOnTrack(x: number, y: number): boolean {
  return pointInPolygon(x, y, OUTER_WALL) && !pointInPolygon(x, y, INNER_WALL);
}

function nearestTrackIndex(x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < TRACK_CENTER.length; i++) {
    const d = dist({ x, y }, TRACK_CENTER[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function getCarProgress(car: Car): number {
  const idx = nearestTrackIndex(car.x, car.y);
  return car.lap + idx / TRACK_POINTS;
}

// ============== COMPONENT ==============
export default function MicroMachines() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"menu" | "racing" | "finished">(
    "menu"
  );
  const [winner, setWinner] = useState<string | null>(null);
  const carsRef = useRef<Car[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Smooth camera
  const cameraRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });

  const initCars = useCallback((count: number) => {
    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"];
    const names = ["Red Rocket", "Blue Bullet", "Green Machine", "Yellow Zap"];
    const controlsList = [
      { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
      { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
      { up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL" },
      { up: "Numpad8", down: "Numpad5", left: "Numpad4", right: "Numpad6" },
    ];

    // Start near bottom of the big track
    const startIdx = Math.floor(TRACK_POINTS * 0.25); // roughly bottom
    const start = TRACK_CENTER[startIdx];
    const next = TRACK_CENTER[(startIdx + 1) % TRACK_POINTS];
    const angle = Math.atan2(next.y - start.y, next.x - start.x);

    const cars: Car[] = [];
    for (let i = 0; i < count; i++) {
      // offset sideways a bit
      const side = (i - (count - 1) / 2) * 38;
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);

      cars.push({
        id: i,
        x: start.x + perpX * side,
        y: start.y + perpY * side,
        angle: angle,
        speed: 0,
        color: colors[i],
        name: names[i],
        controls: controlsList[i],
        lap: 0,
        progress: 0,
        finished: false,
        eliminated: false,
        isAI: i >= 2,
      });
    }
    carsRef.current = cars;

    // Reset camera to start
    cameraRef.current = { x: start.x, y: start.y };
  }, []);

  const startGame = (count: number) => {
    initCars(count);
    setWinner(null);
    setGameState("racing");
    lastTimeRef.current = performance.now();
  };

  // Input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== "racing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const update = () => {
      const cars = carsRef.current;
      const keys = keysRef.current;

      // Find current leader among active cars
      let leader = cars.find((c) => !c.eliminated && !c.finished) || cars[0];
      for (const c of cars) {
        if (!c.eliminated && !c.finished && c.progress > leader.progress) {
          leader = c;
        }
      }

      for (const car of cars) {
        if (car.finished || car.eliminated) continue;

        if (car.isAI) {
          const idx = nearestTrackIndex(car.x, car.y);
          const lookAhead = (idx + 8) % TRACK_POINTS;
          const target = TRACK_CENTER[lookAhead];
          const dx = target.x - car.x;
          const dy = target.y - car.y;
          const desiredAngle = Math.atan2(dy, dx);
          let angleDiff = desiredAngle - car.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          car.angle +=
            Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), AI_TURN_SPEED);
          car.speed = Math.min(
            car.speed + ACCELERATION * 0.75,
            MAX_SPEED * 0.88
          );
        } else {
          const c = car.controls;
          if (keys[c.up])
            car.speed = Math.min(car.speed + ACCELERATION, MAX_SPEED);
          if (keys[c.down])
            car.speed = Math.max(
              car.speed - ACCELERATION * 1.6,
              -MAX_SPEED * 0.35
            );
          if (keys[c.left])
            car.angle -=
              TURN_SPEED * (Math.abs(car.speed) / MAX_SPEED + 0.35);
          if (keys[c.right])
            car.angle +=
              TURN_SPEED * (Math.abs(car.speed) / MAX_SPEED + 0.35);
        }

        car.speed *= FRICTION;

        const nx = car.x + Math.cos(car.angle) * car.speed;
        const ny = car.y + Math.sin(car.angle) * car.speed;

        if (isOnTrack(nx, ny)) {
          car.x = nx;
          car.y = ny;
        } else {
          // bounce
          car.speed *= -0.45;
          car.x += Math.cos(car.angle) * car.speed * 1.5;
          car.y += Math.sin(car.angle) * car.speed * 1.5;
        }

        // Progress & laps
        const idx = nearestTrackIndex(car.x, car.y);
        const prevProgress = car.progress;

        // Detect crossing start line (went from high index to low)
        if (prevProgress % 1 > 0.85 && idx < 8) {
          car.lap += 1;
          if (car.lap >= 3) {
            car.finished = true;
            car.speed = 0;
            setWinner(car.name);
            setGameState("finished");
          }
        }
        car.progress = car.lap + idx / TRACK_POINTS;

        // === ELIMINATION: too far behind the leader ===
        if (!car.finished && car !== leader) {
          const lag = leader.progress - car.progress;
          if (lag >= MAX_LAG_LAPS) {
            car.eliminated = true;
            car.speed = 0;
          }
        }
      }

      // Car-car collisions (only active cars)
      for (let i = 0; i < cars.length; i++) {
        if (cars[i].eliminated || cars[i].finished) continue;
        for (let j = i + 1; j < cars.length; j++) {
          if (cars[j].eliminated || cars[j].finished) continue;
          const a = cars[i];
          const b = cars[j];
          const d = dist(a, b);
          if (d < CAR_WIDTH * 0.95) {
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const push = (CAR_WIDTH * 0.95 - d) / 2;
            a.x -= Math.cos(angle) * push;
            a.y -= Math.sin(angle) * push;
            b.x += Math.cos(angle) * push;
            b.y += Math.sin(angle) * push;
            const avg = (a.speed + b.speed) / 2;
            a.speed = avg * 0.75;
            b.speed = avg * 0.75;
          }
        }
      }

      // Last car standing wins
      const active = cars.filter((c) => !c.eliminated && !c.finished);
      if (active.length === 1 && cars.length > 1) {
        active[0].finished = true;
        setWinner(active[0].name);
        setGameState("finished");
      }

      // === CAMERA: follow the lead car (highest progress among active) ===
      let camLeader = cars.find((c) => !c.eliminated) || cars[0];
      for (const c of cars) {
        if (!c.eliminated && c.progress > camLeader.progress) camLeader = c;
      }

      // Smooth follow
      const cam = cameraRef.current;
      const targetX = camLeader.x;
      const targetY = camLeader.y;
      const lerp = 0.08;
      cam.x += (targetX - cam.x) * lerp;
      cam.y += (targetY - cam.y) * lerp;
    };

    const draw = () => {
      const cam = cameraRef.current;

      // Clear
      ctx.fillStyle = "#2a1a0a";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.save();
      // Center camera on screen
      ctx.translate(CANVAS_WIDTH / 2 - cam.x, CANVAS_HEIGHT / 2 - cam.y);

      // Draw a big wooden table / floor texture feel
      ctx.fillStyle = "#3d2914";
      ctx.fillRect(-200, -200, WORLD_WIDTH + 400, WORLD_HEIGHT + 400);

      // Subtle grid to show scale
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      for (let x = 0; x < WORLD_WIDTH; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < WORLD_HEIGHT; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_WIDTH, y);
        ctx.stroke();
      }

      // Outer track
      ctx.beginPath();
      OUTER_WALL.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = "#4a4a4a";
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 6;
      ctx.stroke();

      // Inner hole
      ctx.beginPath();
      INNER_WALL.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = "#3d2914";
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 6;
      ctx.stroke();

      // Center dashed line
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.setLineDash([20, 14]);
      ctx.beginPath();
      TRACK_CENTER.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Start / finish line
      const start = TRACK_CENTER[0];
      const next = TRACK_CENTER[1];
      const dx = next.x - start.x;
      const dy = next.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(start.x + nx * 80, start.y + ny * 80);
      ctx.lineTo(start.x - nx * 80, start.y - ny * 80);
      ctx.stroke();

      // Checker pattern on finish line
      ctx.fillStyle = "#000";
      for (let i = -4; i < 4; i++) {
        if (i % 2 === 0) {
          ctx.fillRect(
            start.x + nx * (i * 18) - 6,
            start.y + ny * (i * 18) - 6,
            12,
            12
          );
        }
      }

      // Draw cars
      for (const car of carsRef.current) {
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);

        const isOut = car.eliminated;

        // Shadow
        ctx.fillStyle = isOut ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.45)";
        ctx.fillRect(
          -CAR_WIDTH / 2 + 3,
          -CAR_HEIGHT / 2 + 3,
          CAR_WIDTH,
          CAR_HEIGHT
        );

        // Body (gray when eliminated)
        ctx.fillStyle = isOut ? "#666" : car.color;
        ctx.globalAlpha = isOut ? 0.5 : 1;
        ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);

        // Darker roof / window
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(
          -CAR_WIDTH / 2 + 7,
          -CAR_HEIGHT / 2 + 2,
          10,
          CAR_HEIGHT - 4
        );

        if (!isOut) {
          // Headlights
          ctx.fillStyle = "#ffe066";
          ctx.fillRect(CAR_WIDTH / 2 - 5, -CAR_HEIGHT / 2 + 1, 4, 5);
          ctx.fillRect(CAR_WIDTH / 2 - 5, CAR_HEIGHT / 2 - 6, 4, 5);

          // Rear lights
          ctx.fillStyle = "#ff3333";
          ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2 + 2, 3, 4);
          ctx.fillRect(-CAR_WIDTH / 2, CAR_HEIGHT / 2 - 6, 3, 4);
        }

        ctx.globalAlpha = 1;
        ctx.restore();

        // Name + status
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(car.x - 42, car.y - 34, 84, 18);
        ctx.fillStyle = isOut ? "#ff5555" : "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        const label = isOut
          ? `${car.name}  OUT`
          : `${car.name}  L${Math.min(car.lap + 1, 3)}/3`;
        ctx.fillText(label, car.x, car.y - 21);
      }

      ctx.restore(); // end camera transform

      // ===== HUD (screen space) =====
      // Mini-map
      const mapW = 180;
      const mapH = 120;
      const mapX = CANVAS_WIDTH - mapW - 16;
      const mapY = 16;
      const scaleX = mapW / WORLD_WIDTH;
      const scaleY = mapH / WORLD_HEIGHT;

      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(mapX - 4, mapY - 4, mapW + 8, mapH + 8);
      ctx.strokeStyle = "#f1c40f";
      ctx.lineWidth = 2;
      ctx.strokeRect(mapX - 4, mapY - 4, mapW + 8, mapH + 8);

      // Track on minimap
      ctx.beginPath();
      OUTER_WALL.forEach((p, i) => {
        const mx = mapX + p.x * scaleX;
        const my = mapY + p.y * scaleY;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      });
      ctx.closePath();
      ctx.fillStyle = "#555";
      ctx.fill();

      ctx.beginPath();
      INNER_WALL.forEach((p, i) => {
        const mx = mapX + p.x * scaleX;
        const my = mapY + p.y * scaleY;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      });
      ctx.closePath();
      ctx.fillStyle = "#2a1a0a";
      ctx.fill();

      // Cars on minimap
      for (const car of carsRef.current) {
        ctx.fillStyle = car.eliminated ? "#555" : car.color;
        ctx.globalAlpha = car.eliminated ? 0.4 : 1;
        ctx.beginPath();
        ctx.arc(
          mapX + car.x * scaleX,
          mapY + car.y * scaleY,
          car.eliminated ? 3 : 4,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Leaderboard
      const sorted = [...carsRef.current].sort((a, b) => {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        return b.progress - a.progress;
      });
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(12, 12, 240, 28 + sorted.length * 24);
      ctx.fillStyle = "#f1c40f";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";
      ctx.fillText("LEADERBOARD", 22, 32);

      sorted.forEach((c, i) => {
        ctx.fillStyle = c.eliminated ? "#888" : c.color;
        let label: string;
        if (c.eliminated) {
          label = `${i + 1}. ${c.name}  OUT`;
        } else if (c.finished) {
          label = `${i + 1}. ${c.name}  FINISHED`;
        } else {
          label = `${i + 1}. ${c.name}  Lap ${Math.min(c.lap + 1, 3)}/3`;
        }
        ctx.fillText(label, 22, 56 + i * 22);
      });

      // Rules reminder
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Fall too far behind the leader → you're OUT  •  Camera follows the leader",
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT - 12
      );
    };

    const loop = (time: number) => {
      lastTimeRef.current = time;
      update();
      draw();
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [gameState]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-950 via-amber-900 to-stone-950 flex flex-col items-center justify-center p-3 font-sans">
      <h1 className="text-4xl md:text-5xl font-black text-yellow-300 drop-shadow-[0_4px_0_#000] mb-1 tracking-tight">
        MICRO MACHINES
      </h1>
      <p className="text-amber-200/80 mb-4 text-sm">
        Bigger track • Camera follows the leader • Lag too far = OUT
      </p>

      {gameState === "menu" && (
        <div className="bg-black/70 backdrop-blur rounded-2xl p-8 max-w-md w-full text-center border-2 border-yellow-500/40 shadow-2xl">
          <h2 className="text-2xl text-white font-bold mb-6">Select Players</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => startGame(n)}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-4 px-6 rounded-xl text-lg transition transform hover:scale-105 active:scale-95"
              >
                {n} Players
              </button>
            ))}
          </div>
          <div className="text-left text-amber-100 text-sm space-y-2 bg-black/50 p-4 rounded-lg">
            <p className="font-bold text-yellow-300">Controls</p>
            <p>
              <span className="text-red-400 font-semibold">P1 Red:</span> Arrow
              Keys
            </p>
            <p>
              <span className="text-blue-400 font-semibold">P2 Blue:</span> WASD
            </p>
            <p className="text-xs text-amber-300/60 mt-2">
              P3 & P4 are AI. Race to 3 laps — or last car standing.
              <br />
              Fall ~¾ of a lap behind the leader and you&apos;re OUT.
              Camera follows the leader.
            </p>
          </div>
        </div>
      )}

      {(gameState === "racing" || gameState === "finished") && (
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="rounded-xl border-4 border-yellow-600/80 shadow-2xl max-w-full h-auto bg-black"
          />
          {gameState === "finished" && (
            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center rounded-xl">
              <h2 className="text-5xl font-black text-yellow-300 mb-2 drop-shadow-lg">
                {winner} WINS!
              </h2>
              <p className="text-white/90 mb-6">First to 3 laps</p>
              <button
                onClick={() => setGameState("menu")}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-8 rounded-xl text-lg"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="mt-5 text-amber-200/50 text-xs text-center max-w-xl">
        Bigger track • Camera follows leader • Fall too far behind → eliminated
      </footer>
    </div>
  );
}
