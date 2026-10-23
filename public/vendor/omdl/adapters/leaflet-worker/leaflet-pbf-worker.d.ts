interface RenderFeature {
    type: 1 | 2 | 3;
    rings: number[][];
    strokeStyle: string;
    lineWidth: number;
    lineCap: string;
    globalAlpha: number;
    fill: boolean;
    pointRadius: number;
}
interface RenderMessage {
    id: number;
    tileSize: number;
    features: RenderFeature[];
}
