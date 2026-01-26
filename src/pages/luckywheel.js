import React, { useState, useRef, useEffect } from 'react';
import Layout from '@theme/Layout';
import { LuckyWheel } from '@lucky-canvas/react';

const PRIZES_CONFIG = [
  { name: '一等奖', color: '#e91e63', weight: 1 },
  { name: '二等奖', color: '#ff9800', weight: 10 },
  { name: '三等奖', color: '#2196f3', weight: 20 },
  { name: '谢谢参与', color: '#9e9e9e', weight: 69 },
];

export default function LuckyWheelPage() {
  const myLucky = useRef();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false);
  const [fingerprint, setFingerprint] = useState('');

  // 初始化指纹检查
  useEffect(() => {
    const id = btoa([navigator.userAgent, screen.width, navigator.language].join('|')).substring(0, 16);
    setFingerprint(id);
    if (localStorage.getItem(`draw_v1_${id}`)) {
      setHasParticipated(true);
    }
  }, []);

  const prizes = PRIZES_CONFIG.map(p => ({
    background: p.color,
    fonts: [{ text: p.name, top: '15%', fontSize: '16px', fontWeight: '700', color: '#fff' }],
  }));

  // --- 关键：使用原生 Canvas 绘制又长又尖的指针 ---
  const buttons = [{
    radius: '25%',
    background: '#fff',
    pointer: false,
    imgs: [{
      width: '40px',
      top: '-50px',
      // 直接通过绘图函数生成指针，不依赖外部图片
      src: '', 
      handler: (ctx) => {
        ctx.beginPath();
        ctx.fillStyle = '#fff'; // 指针颜色
        ctx.moveTo(20, 50);    // 起点（底部中心）
        ctx.lineTo(0, 50);     // 左下角
        ctx.lineTo(20, 0);     // 顶点（最尖部）
        ctx.lineTo(40, 50);    // 右下角
        ctx.closePath();
        ctx.fill();
      }
    }],
    fonts: [{ text: 'GO', color: '#333', top: '-5px', fontWeight: 'bold' }]
  }];

  const startSpin = () => {
    // 逻辑修改：不再直接隐藏转盘，而是在点击时判断
    if (hasParticipated) {
      alert("⚠️ 您已参与过抽奖，请勿重复操作。如有疑问请联系管理员。");
      return;
    }
    if (isSubmitting) return;

    myLucky.current.play();
    setTimeout(() => {
      const totalWeight = PRIZES_CONFIG.reduce((acc, curr) => acc + curr.weight, 0);
      let random = Math.random() * totalWeight;
      let index = 0;
      for (let i = 0; i < PRIZES_CONFIG.length; i++) {
        random -= PRIZES_CONFIG[i].weight;
        if (random <= 0) { index = i; break; }
      }
      myLucky.current.stop(index);
    }, 2500);
  };

  const onEnd = async (prize) => {
    const prizeName = prize.fonts[0].text;
    setIsSubmitting(true);

    try {
      const response = await fetch('https://formspree.io/f/xqeqbogb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prize: prizeName,
          uid: fingerprint,
          info: navigator.userAgent
        }),
      });

      if (response.ok) {
        // 标记已参与，但页面不跳转/不消失
        localStorage.setItem(`draw_v1_${fingerprint}`, 'true');
        setHasParticipated(true);
        alert(`🎉 恭喜获得：${prizeName}！结果已自动保存。`);
      }
    } catch (e) {
      alert('保存失败，请检查网络。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout title="抽奖" noFooter={true}>
      <div style={{ 
        textAlign: 'center', 
        background: '#1a1a1a', 
        minHeight: '100vh', 
        color: '#fff', 
        paddingTop: '60px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <h2>🎁 幸运大转盘</h2>
        
        <div style={{ marginTop: '20px' }}>
          <LuckyWheel
            ref={myLucky}
            width="320px"
            height="320px"
            blocks={[{ padding: '10px', background: '#333' }]}
            prizes={prizes}
            buttons={buttons}
            onStart={startSpin}
            onEnd={onEnd}
          />
        </div>

        <div style={{ marginTop: '40px', fontSize: '13px', color: '#666' }}>
          <p>ID: {fingerprint}</p>
          {hasParticipated && <p style={{ color: '#e91e63' }}>您已登记中奖信息，无法再次启动</p>}
        </div>
      </div>
    </Layout>
  );
}