import React, { useState, useRef } from 'react';
import { useCamera } from './hooks/useCamera';
import { motion, useMotionValue, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Move,
  Video,
  Mic,
  Settings,
  Zap,
  RefreshCcw,
  ZoomIn,
  Clock,
  ChevronRight,
  Monitor,
  Cpu,
  Save,
  Trash2,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const App: React.FC = () => {
  const host = window.location.hostname;
  const { status, segments, connected, toasts, removeToast, sendCommand, sendGimbalCommand } =
    useCamera(`ws://${host}:8080`);
  const [activeTab, setActiveTab] = useState<'controls' | 'ai' | 'recordings'>('controls');
  const [invertY, setInvertY] = useState(false);
  const [zoom, setZoom] = useState(1.0);

  // Gimbal Motion Values
  const joystickX = useMotionValue(0);
  const joystickY = useMotionValue(0);
  const lastCommandTime = useRef(0);

  const handleJoystickDrag = () => {
    const now = Date.now();
    if (now - lastCommandTime.current < 33) return;
    lastCommandTime.current = now;

    const x = joystickX.get();
    const y = joystickY.get();

    const pan = (x / 55) * 50;
    let pitch = (-y / 55) * 50;

    if (invertY) {
      pitch = -pitch;
    }

    sendGimbalCommand('gimbal-set-speed', { pitch, pan, roll: 0 });
  };

  const handleJoystickReset = () => {
    joystickX.set(0);
    joystickY.set(0);
    lastCommandTime.current = 0;
    sendGimbalCommand('gimbal-stop');
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const step = 0.5;
    const newZoom = direction === 'in' ? Math.min(zoom + step, 4.0) : Math.max(zoom - step, 1.0);
    setZoom(newZoom);
    sendCommand('zoom-set', { zoom: newZoom });
  };

  const isAIEnabled = Boolean(status?.status?.aiMode && status.status.aiMode !== 0);

  const handleToggleAI = () => {
    const newEnabled = !isAIEnabled;
    sendCommand(
      'ai-set-enabled',
      { enabled: newEnabled },
      { field: 'aiMode', value: newEnabled ? 2 : 0 }
    );
  };

  const handleDownloadSegment = async (filename: string) => {
    try {
      const downloadUrl = `http://${host}:8080/api/download/${filename}`;

      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download segment:', error);
    }
  };

  // Desktop Tab Button
  const DesktopTabButton = ({
    id,
    label,
    icon: Icon,
  }: {
    id: typeof activeTab;
    label: string;
    icon: any;
  }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={cn(
        'flex-1 py-3 px-2 flex flex-col items-center gap-1 transition-all',
        activeTab === id
          ? 'text-blue-500 bg-white/5 border-b-2 border-blue-500'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border-b-2 border-transparent'
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );

  // Mobile Tab Button
  const MobileTabButton = ({
    id,
    label,
    icon: Icon,
  }: {
    id: typeof activeTab;
    label: string;
    icon: any;
  }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={cn(
        'flex-1 py-2 px-3 flex flex-col items-center gap-1 transition-all rounded-xl',
        activeTab === id ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-500 active:bg-white/5'
      )}
    >
      <Icon
        className={cn('w-5 h-5', activeTab === id && 'drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]')}
      />
      <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );

  // Shared Controls Content
  const ControlsContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Joystick Control */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Gimbal Control
          </h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer group">
              <span className="text-[9px] font-bold text-zinc-500 group-hover:text-zinc-400 uppercase tracking-widest">
                Invert Y
              </span>
              <input
                type="checkbox"
                checked={invertY}
                onChange={(e) => setInvertY(e.target.checked)}
                className="w-3 h-3 rounded bg-zinc-700 border-zinc-600 text-blue-600 cursor-pointer"
              />
            </label>
            <button
              onClick={() => {
                handleJoystickReset();
                sendGimbalCommand('gimbal-reset');
              }}
              className="p-1.5 hover:bg-blue-500/10 hover:text-blue-500 rounded-md text-zinc-500 transition-colors"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className={cn('relative mx-auto', isMobile ? 'w-36 h-36' : 'w-48 h-48')}>
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/5 flex items-center justify-center cursor-move">
            <div
              className={cn(
                'rounded-full bg-white/[0.02] border border-white/10 shadow-inner flex items-center justify-center relative',
                isMobile ? 'w-28 h-28' : 'w-40 h-40'
              )}
            >
              {/* Crosshairs */}
              <div className="absolute w-full h-px bg-white/5" />
              <div className="absolute h-full w-px bg-white/5" />

              {/* Draggable Stick */}
              <motion.div
                drag
                dragSnapToOrigin
                dragConstraints={
                  isMobile
                    ? { left: -40, right: 40, top: -40, bottom: 40 }
                    : { left: -55, right: 55, top: -55, bottom: 55 }
                }
                dragElastic={0}
                onDrag={handleJoystickDrag}
                onDragEnd={handleJoystickReset}
                style={{ x: joystickX, y: joystickY }}
                className={cn(
                  'bg-blue-600 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.5)] cursor-grab active:cursor-grabbing flex items-center justify-center z-10 touch-none',
                  isMobile ? 'w-10 h-10' : 'w-12 h-12'
                )}
              >
                <div className={cn('rounded-full bg-white/10', isMobile ? 'w-4 h-4' : 'w-6 h-6')} />
              </motion.div>
            </div>
          </div>
          {/* Labels */}
          <span
            className={cn(
              'absolute top-0 left-1/2 -translate-x-1/2 text-[10px] text-zinc-500 font-bold uppercase',
              isMobile ? '-translate-y-4' : '-translate-y-6'
            )}
          >
            Tilt
          </span>
          <span
            className={cn(
              'absolute top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-bold uppercase rotate-90',
              isMobile ? '-right-6' : '-right-8'
            )}
          >
            Pan
          </span>
        </div>
      </section>

      {/* Zoom Control */}
      <section className="space-y-4 pt-6 border-t border-white/5">
        <div className="flex justify-between items-center">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Zoom</h3>
          <span className="text-sm font-mono font-bold text-blue-400">{zoom.toFixed(1)}x</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleZoom('out')}
            disabled={zoom <= 1.0}
            className="flex-1 py-3 bg-white/5 hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-white/5 rounded-xl text-lg font-bold transition-all border border-white/10 hover:border-blue-400 disabled:hover:border-white/10"
          >
            −
          </button>
          <div className="w-16 text-center">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${((zoom - 1) / 3) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => handleZoom('in')}
            disabled={zoom >= 4.0}
            className="flex-1 py-3 bg-white/5 hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-white/5 rounded-xl text-lg font-bold transition-all border border-white/10 hover:border-blue-400 disabled:hover:border-white/10"
          >
            +
          </button>
        </div>
      </section>

      {/* Presets Grid */}
      <section className="space-y-4 pt-6 border-t border-white/5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Presets</h3>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((id) => (
            <button
              key={id}
              className="p-3 bg-white/5 hover:bg-blue-600 rounded-xl text-xs font-bold transition-all border border-white/10 hover:border-blue-400 group"
            >
              <div className="flex items-center justify-between">
                <span>Point {id}</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  );

  // Shared AI Content
  const AIContent = () => (
    <div className="space-y-6">
      {/* Master Toggle */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">AI Tracking</h3>
          <div
            onClick={handleToggleAI}
            className={cn(
              'w-9 h-5 rounded-full p-0.5 cursor-pointer transition-all',
              isAIEnabled ? 'bg-blue-600' : 'bg-zinc-700'
            )}
          >
            <div
              className={cn(
                'w-4 h-4 rounded-full bg-white transition-all duration-300',
                isAIEnabled ? 'ml-4' : 'ml-0'
              )}
            />
          </div>
        </div>
      </section>

      {/* Mode & Sub-Mode */}
      <section className="space-y-4 pt-4 border-t border-white/5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Mode</label>
            <select
              value={status?.status?.aiMode || 0}
              onChange={(e) => {
                const newMode = parseInt(e.target.value);
                sendCommand(
                  'ai-set-mode',
                  { mode: newMode, subMode: status?.status?.aiSubMode || 0 },
                  { field: 'aiMode', value: newMode }
                );
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              <option value="0">Off</option>
              <option value="1">Group</option>
              <option value="2">Human</option>
              <option value="3">Hand</option>
              <option value="4">Whiteboard</option>
              <option value="5">Desk</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">
              Sub-mode
            </label>
            <select
              value={status?.status?.aiSubMode || 0}
              onChange={(e) => {
                const newSubMode = parseInt(e.target.value);
                sendCommand(
                  'ai-set-mode',
                  { mode: status?.status?.aiMode || 0, subMode: newSubMode },
                  { field: 'aiSubMode', value: newSubMode }
                );
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              <option value="0">Normal</option>
              <option value="1">Upper Body</option>
              <option value="2">Close Up</option>
              <option value="3">Head Hide</option>
              <option value="4">Lower Body</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Speed</label>
          <select
            value={status?.status?.aiTrackerSpeed || 2}
            onChange={(e) => {
              const newSpeed = parseInt(e.target.value);
              sendCommand(
                'ai-set-tracking-speed',
                { speed: newSpeed },
                { field: 'aiTrackerSpeed', value: newSpeed }
              );
            }}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="0">Lazy</option>
            <option value="1">Slow</option>
            <option value="2">Standard</option>
            <option value="3">Fast</option>
            <option value="4">Crazy</option>
            <option value="5">Auto</option>
          </select>
        </div>

        {/* Auto Zoom Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="auto-zoom"
            checked={status?.status?.autoZoom || false}
            onChange={() => sendCommand('ai-set-auto-zoom', { enabled: !status?.status?.autoZoom })}
            className="rounded bg-zinc-700 border-zinc-600 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
          <label htmlFor="auto-zoom" className="text-xs text-zinc-300 cursor-pointer">
            Auto Zoom
          </label>
        </div>
      </section>

      {/* Target Selection */}
      <section className="space-y-3 pt-4 border-t border-white/5">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => sendCommand('ai-select-central')}
            className="py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] transition-colors"
          >
            Select Central
          </button>
          <button
            onClick={() => sendCommand('ai-select-biggest')}
            className="py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] transition-colors"
          >
            Select Biggest
          </button>
        </div>
        <button
          onClick={() => sendCommand('ai-deselect')}
          className="w-full py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] text-zinc-400 transition-colors"
        >
          Deselect Target
        </button>
      </section>

      {/* Gesture Controls */}
      <section className="space-y-2 pt-4 border-t border-white/5">
        <label className="text-[10px] text-zinc-500 uppercase font-bold block">Gestures</label>
        {[
          { label: 'Target Select', gesture: 0, isActive: status?.status?.gestureTarget },
          { label: 'Zoom', gesture: 1, isActive: status?.status?.gestureZoom },
          { label: 'Dynamic Zoom', gesture: 2, isActive: status?.status?.gestureDynamicZoom },
        ].map((item) => (
          <label key={item.gesture} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={item.isActive || false}
              onChange={() =>
                sendCommand('ai-set-gesture', { gesture: item.gesture, enabled: !item.isActive })
              }
              className="rounded bg-zinc-700 border-zinc-600 text-blue-600 cursor-pointer"
            />
            <span className="text-xs text-zinc-300">{item.label}</span>
          </label>
        ))}
      </section>
    </div>
  );

  // Shared Recordings Content
  const RecordingsContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Loop Library</h3>
        <span className="text-[10px] font-mono text-zinc-500">{segments.length} segments</span>
      </div>

      <div className="space-y-2">
        {segments.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-zinc-600">
            <Clock className="w-8 h-8 opacity-20" />
            <p className="text-xs italic">Waiting for segments...</p>
          </div>
        ) : (
          segments.map((seg) => (
            <div
              key={seg.filename}
              className={cn(
                'group relative p-3 rounded-xl border transition-all cursor-pointer',
                seg.keep
                  ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'p-2 rounded-lg shrink-0',
                    seg.type === 'video'
                      ? 'bg-black/30 text-blue-500'
                      : 'bg-black/30 text-amber-500'
                  )}
                >
                  {seg.type === 'video' ? (
                    <Video className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-bold text-zinc-300 truncate tracking-tight">
                    {seg.filename.replace(/_/g, ' ')}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {seg.keep ? (
                      <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Saved
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                        Temp Buffer
                      </span>
                    )}
                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                    <span className="text-[9px] font-mono text-zinc-600">30.2s</span>
                  </div>
                </div>
              </div>

              {/* Hover Actions */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!seg.keep && (
                  <button className="p-2 hover:bg-red-500/20 text-zinc-400 hover:text-red-500 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleDownloadSegment(seg.filename)}
                  className="p-2 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-500 rounded-lg transition-colors"
                  title="Download clip"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen lg:h-screen h-[100dvh] bg-[#0a0a0c] text-zinc-100 font-sans overflow-hidden">
      {/* ==================== DESKTOP LAYOUT (lg+) ==================== */}
      <div className="hidden lg:flex lg:flex-col lg:h-full">
        {/* Header */}
        <header className="flex justify-between items-center px-6 py-3 bg-black/20 backdrop-blur-md border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">
                OBSBOT <span className="text-blue-500">Center</span>
              </h1>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">
                v2.0.0 • Server-Side Control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 px-4 py-1.5 bg-zinc-900 rounded-full border border-white/5">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs font-mono text-zinc-300">NVENC Active</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    connected
                      ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]'
                      : 'bg-red-500'
                  )}
                />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {connected ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-1 overflow-hidden">
          {/* Left: Video Area */}
          <div className="flex-1 flex flex-col p-6 gap-6">
            <div className="flex-1 relative bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl group">
              {connected ? (
                <iframe
                  src={`http://${host}:8890/live`}
                  className="w-full h-full border-none"
                  allow="autoplay; fullscreen"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <Video className="w-16 h-16 text-zinc-800" />
                    <Zap className="w-6 h-6 text-blue-500 absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-zinc-500 font-medium">No signal from server</p>
                    <p className="text-[10px] text-zinc-600 font-mono mt-1">
                      Check if MediaMTX and obsbot-server are running
                    </p>
                  </div>
                </div>
              )}

              {/* HUD Overlays */}
              <div className="absolute top-4 left-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-2">
                  <Monitor className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] font-mono text-zinc-300">1080p60</span>
                </div>
              </div>
            </div>

            {/* Bottom Bar: Status Info */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
              {[
                {
                  label: 'AI Mode',
                  value:
                    ['Off', 'Group', 'Human', 'Hand', 'Whiteboard', 'Desk'][
                      status?.status?.aiMode || 0
                    ] || 'Off',
                  icon: Zap,
                  active: isAIEnabled,
                },
                { label: 'Zoom', value: `${zoom.toFixed(1)}x`, icon: ZoomIn },
                {
                  label: 'Tracking',
                  value: isAIEnabled ? 'ACTIVE' : 'IDLE',
                  icon: Move,
                  active: isAIEnabled,
                },
                { label: 'Audio', value: 'STREAMING', icon: Mic },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-[#17171a]/70 backdrop-blur-md p-3 rounded-xl border border-white/5 flex items-center gap-3"
                >
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      item.active ? 'bg-blue-500/20 text-blue-500' : 'bg-white/5 text-zinc-400'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none mb-1">
                      {item.label}
                    </p>
                    <p className="text-xs font-mono font-bold text-zinc-200">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Sidebar Panel */}
          <aside className="w-96 bg-[#17171a]/70 backdrop-blur-md border-l border-white/5 flex flex-col shrink-0">
            {/* Tabs Navigation */}
            <nav className="flex bg-black/20 shrink-0 border-b border-white/5">
              <DesktopTabButton id="controls" label="Controls" icon={Move} />
              <DesktopTabButton id="ai" label="AI" icon={Zap} />
              <DesktopTabButton id="recordings" label="Library" icon={Save} />
            </nav>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {activeTab === 'controls' && <ControlsContent />}
              {activeTab === 'ai' && <AIContent />}
              {activeTab === 'recordings' && <RecordingsContent />}
            </div>
          </aside>
        </main>

        {/* Footer Info */}
        <footer className="px-6 py-2 bg-black/20 border-t border-white/5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4 text-[10px] font-medium tracking-wider text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Settings className="w-3 h-3" />
              <span>NVENC HEVC @ 12Mbps</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-zinc-700" />
            <span>Buffer: 10m Rolling</span>
          </div>
          <div className="text-[10px] font-mono text-zinc-500 italic">
            latency_mode: ultra_low_zerolatency
          </div>
        </footer>
      </div>

      {/* ==================== MOBILE LAYOUT (< lg) ==================== */}
      <div className="flex flex-col h-full lg:hidden">
        {/* Top Section: Video Feed */}
        <div className="relative h-[45dvh] min-h-[200px] shrink-0 bg-black">
          {/* Status Bar Overlay */}
          <div className="absolute top-0 left-0 right-0 z-10 px-4 py-2 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="bg-cyan-600 p-1 rounded-md">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-bold text-white/90">OBSBOT</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 backdrop-blur-sm rounded-full">
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      connected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-500'
                    )}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wide">
                    {connected ? 'Live' : 'Off'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Video Content */}
          {connected ? (
            <iframe
              src={`http://${host}:8890/live`}
              className="w-full h-full border-none"
              allow="autoplay; fullscreen"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
              <div className="relative">
                <Video className="w-12 h-12 text-zinc-800" />
                <Zap className="w-5 h-5 text-cyan-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <div className="text-center px-6">
                <p className="text-sm text-zinc-500 font-medium">No signal</p>
                <p className="text-[10px] text-zinc-600 font-mono mt-1">Start MediaMTX & server</p>
              </div>
            </div>
          )}

          {/* Quick Status Pills */}
          <div className="absolute bottom-3 left-3 right-3 flex gap-2 overflow-x-auto scrollbar-hide">
            {[
              {
                label:
                  ['Off', 'Group', 'Human', 'Hand', 'WB', 'Desk'][status?.status?.aiMode || 0] ||
                  'Off',
                icon: Zap,
                active: isAIEnabled,
              },
              { label: `${zoom.toFixed(1)}x`, icon: ZoomIn },
              { label: isAIEnabled ? 'Track' : 'Idle', icon: Move, active: isAIEnabled },
            ].map((item, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md border shrink-0',
                  item.active
                    ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400'
                    : 'bg-black/50 border-white/10 text-zinc-400'
                )}
              >
                <item.icon className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section: Controls Panel */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#0f0f12]">
          {/* Controls Content - Scrollable */}
          <div className="flex-1 overflow-y-auto pb-24 custom-scrollbar">
            <div className="p-4 space-y-6">
              {activeTab === 'controls' && <ControlsContent isMobile />}
              {activeTab === 'ai' && <AIContent />}
              {activeTab === 'recordings' && <RecordingsContent />}
            </div>
          </div>
        </div>

        {/* Floating Bottom Tab Bar - Fixed to viewport */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-[#0f0f12] via-[#0f0f12]/95 to-transparent lg:hidden">
          <div className="flex bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-white/10 p-1.5 shadow-2xl shadow-black/50">
            <MobileTabButton id="controls" label="Controls" icon={Move} />
            <MobileTabButton id="ai" label="AI" icon={Zap} />
            <MobileTabButton id="recordings" label="Library" icon={Save} />
          </div>
        </nav>
      </div>

      {/* Toast Notifications - Shared */}
      <div
        className={cn(
          'fixed z-50 flex flex-col gap-2 pointer-events-none',
          'top-16 left-4 right-4 lg:top-auto lg:bottom-6 lg:left-auto lg:right-6 lg:min-w-[300px]'
        )}
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md pointer-events-auto',
                toast.type === 'error' && 'bg-red-500/20 border-red-500/30 text-red-200',
                toast.type === 'success' &&
                  'bg-emerald-500/20 border-emerald-500/30 text-emerald-200',
                toast.type === 'info' && 'bg-blue-500/20 border-blue-500/30 text-blue-200'
              )}
            >
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
              {toast.type === 'success' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              )}
              <span className="flex-1 text-sm font-medium">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default App;
