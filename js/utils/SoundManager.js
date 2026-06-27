class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.ambientGain = null;
        this.ambientOsc = [];
        this._init();
    }

    _init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.enabled = false;
        }
    }

    _ensureCtx() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    whistle() {
        if (!this.enabled) return;
        this._ensureCtx();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1800, t);
        osc.frequency.linearRampToValueAtTime(2400, t + 0.08);
        osc.frequency.linearRampToValueAtTime(1600, t + 0.35);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.15);
        gain.gain.linearRampToValueAtTime(0, t + 0.4);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
    }

    kick(velocity) {
        if (!this.enabled) return;
        this._ensureCtx();
        const t = this.ctx.currentTime;
        const vol = Math.min(0.35, 0.05 + velocity * 0.0003);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150 + velocity * 0.2, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);

        const noise = this.ctx.createBufferSource();
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        noise.buffer = buf;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(vol * 0.5, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 800;
        noise.connect(filt).connect(ng).connect(this.ctx.destination);
        noise.start(t);
        noise.stop(t + 0.05);
    }

    wallHit(velocity) {
        if (!this.enabled) return;
        this._ensureCtx();
        const t = this.ctx.currentTime;
        const vol = Math.min(0.15, 0.02 + velocity * 0.0001);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300 + velocity * 0.1, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.04);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.06);
    }

    postHit(velocity) {
        if (!this.enabled) return;
        this._ensureCtx();
        const t = this.ctx.currentTime;
        const vol = Math.min(0.25, 0.05 + velocity * 0.0002);
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc2.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
        osc2.frequency.setValueAtTime(1800, t);
        osc2.frequency.exponentialRampToValueAtTime(900, t + 0.1);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain).connect(this.ctx.destination);
        osc2.connect(gain);
        osc.start(t);
        osc2.start(t);
        osc.stop(t + 0.2);
        osc2.stop(t + 0.15);
    }

    goal() {
        if (!this.enabled) return;
        this._ensureCtx();
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const start = t + i * 0.1;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
            gain.gain.linearRampToValueAtTime(0.2, start + 0.15);
            gain.gain.linearRampToValueAtTime(0, start + 0.35);
            osc.connect(gain).connect(this.ctx.destination);
            osc.start(start);
            osc.stop(start + 0.35);
        });

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.50, t + 0.4);
        gain.gain.setValueAtTime(0, t + 0.4);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.42);
        gain.gain.linearRampToValueAtTime(0, t + 0.9);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t + 0.4);
        osc.stop(t + 0.9);
    }

    win() {
        if (!this.enabled) return;
        this._ensureCtx();
        const t = this.ctx.currentTime;
        const melody = [523.25, 659.25, 783.99, 659.25, 783.99, 1046.50];
        melody.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const start = t + i * 0.15;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
            gain.gain.linearRampToValueAtTime(0, start + 0.25);
            osc.connect(gain).connect(this.ctx.destination);
            osc.start(start);
            osc.stop(start + 0.25);
        });
    }

    startAmbient() {
        if (!this.enabled || !this.ctx) return;
        this._ensureCtx();
        if (this.ambientGain) return;
        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = 0.03;
        this.ambientGain.connect(this.ctx.destination);

        const chords = [[130.81, 164.81, 196.00], [146.83, 174.61, 220.00]];
        chords.forEach((freqs) => {
            freqs.forEach((freq) => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const lfo = this.ctx.createOscillator();
                const lfoGain = this.ctx.createGain();
                lfo.frequency.value = 0.1 + Math.random() * 0.2;
                lfoGain.gain.value = freq * 0.005;
                lfo.connect(lfoGain).connect(osc.frequency);
                osc.connect(this.ambientGain);
                osc.start();
                lfo.start();
                this.ambientOsc.push({ osc, lfo });
            });
        });
    }

    stopAmbient() {
        this.ambientOsc.forEach(({ osc, lfo }) => {
            try { osc.stop(); lfo.stop(); } catch (e) {}
        });
        this.ambientOsc = [];
        if (this.ambientGain) {
            this.ambientGain.disconnect();
            this.ambientGain = null;
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) this.stopAmbient();
        else this.startAmbient();
        return this.enabled;
    }
}
