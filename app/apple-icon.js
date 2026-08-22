import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #F2A93B 0%, #C97F1E 100%)',
          borderRadius: 40,
          color: '#0B0D0F',
          fontSize: 110,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        Q
      </div>
    ),
    { ...size }
  );
}
