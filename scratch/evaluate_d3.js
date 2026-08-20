import { createConfig } from '../core/config.js';
import { amaDrag } from '../core/hydro.js';

const config = createConfig();
const u = 3.5;
const v = -0.3;
const r = 0.3;
const phi = -0.1; // typical heel pressed
const crewPos = 0.35;
const end = 1;

const res = amaDrag(u, v, r, phi, crewPos, end, config);
console.log('Ama forces:', res);
console.log('yAma * Fx:', -config.ama.spacing * end * res.Fx);
console.log('Total yawMoment:', res.yawMoment);
console.log('Ratio total / (Fx * spacing):', Math.abs(res.yawMoment) / Math.abs(res.Fx * config.ama.spacing));
