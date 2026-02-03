import React, { useState, useRef, useEffect } from 'react';
import Layout from '@theme/Layout';
import { LuckyWheel } from '@lucky-canvas/react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from '@docusaurus/Head';
import useBaseUrl from '@docusaurus/useBaseUrl';

const PASS_1 = "1"; 
const PASS_2 = "2"; 
const FORMSPREE_URL = "https://formspree.io/f/xqeqbogb";

const INITIAL_PRIZES = [
  { id: 1, name: 'YSL口红', color: '#FF6B6B', img: '/gift/gift1.png' },
  { id: 2, name: 'CK包包', color: '#FF8E99', img: '/gift/gift2.png' },
  { id: 3, name: '全套新年限定皮肤', color: '#FF92AE', img: '/gift/gift3.png' },
  { id: 4, name: '维秘睡衣', color: '#FFB3BA', img: '/gift/gift4.png' },
  { id: 5, name: '朵莉亚cos服', color: '#FF6B6B', img: '/gift/gift5.png' },
  { id: 6, name: '拍立得', color: '#FF8E99', img: '/gift/gift6.png' },
  { id: 7, name: 'amiro化妆镜', color: '#FF92AE', img: '/gift/gift7.png' },
  { id: 8, name: 'Chanel发香喷雾', color: '#FFB3BA', img: '/gift/gift8.png' },
];

export default function LuckyWheelPage() {
  const myLucky = useRef(null);
  const base = useBaseUrl('/');
  const [step, setStep] = useState('pass1'); 
  const [lastStep, setLastStep] = useState('pass1');
  const [inputPass, setInputPass] = useState('');
  const [excludedIds, setExcludedIds] = useState([]); 
  const [focusedIds, setFocusedIds] = useState([]);   
  const [finalPrizes, setFinalPrizes] = useState([]);
  const [wonPrize, setWonPrize] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);

  const getFullImgPath = (relPath) => {
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${b}${relPath}`;
  };

useEffect(() => {
  // 1. 生成纯设备指纹（去掉 today），保证这个用户在同一台电脑上的 ID 永远不变
  const deviceId = btoa([navigator.userAgent, screen.width].join('|')).substring(0, 16);
  setFingerprint(deviceId);

  // 2. 获取今天的日期字符串
  const todayStr = new Date().toDateString(); // 例如: "Fri Jan 31 2026"

  // 3. 检查缓存
  const lastDrawDate = localStorage.getItem(`last_draw_date_${deviceId}`);

  // 4. 如果缓存的日期等于今天，说明今天已经抽过了
  if (lastDrawDate === todayStr) {
    setHasParticipated(true);
  } else {
    setHasParticipated(false);
  }
}, []);

  const handleVerify = () => {
    if (step === 'pass1') {
      if (inputPass === PASS_1) { setStep('exclude'); setInputPass(''); }
      else { setLastStep('pass1'); setStep('error'); }
    } else if (step === 'pass2') {
      if (inputPass === PASS_2) { setStep('focus'); setInputPass(''); }
      else { setLastStep('pass2'); setStep('error'); }
    }
  };

  const toggleSelect = (id, list, setList, max) => {
    if (list.includes(id)) setList(list.filter(i => i !== id));
    else if (list.length < max) setList([...list, id]);
  };

  const prepareWheelData = async () => {
    setIsPreparing(true);
    const remaining = INITIAL_PRIZES.filter(p => !excludedIds.includes(p.id));
    
    const prepared = await Promise.all(remaining.map(p => {
      return new Promise((resolve) => {
        const imgObj = new Image();
        imgObj.src = getFullImgPath(p.img);
        const weightValue = focusedIds.includes(p.id) ? 30 : 10;
        imgObj.onload = () => resolve({ ...p, weight: weightValue, wheelImg: imgObj });
        imgObj.onerror = () => resolve({ ...p, weight: weightValue, wheelImg: { src: getFullImgPath(p.img) } });
      });
    }));

    setFinalPrizes(prepared);
    setIsPreparing(false);
    setStep('wheel');
  };

  const startSpin = () => {
    if (hasParticipated) { setStep('warning'); return; }
    if (isSubmitting || !myLucky.current) return;
    
    // 启动旋转
    myLucky.current.play();

    // 2.5秒后根据权重计算停止位置
    setTimeout(() => {
      const totalWeight = finalPrizes.reduce((sum, p) => sum + (p.weight || 10), 0);
      let random = Math.random() * totalWeight;
      let stopIndex = 0;
      
      for (let i = 0; i < finalPrizes.length; i++) {
        random -= (finalPrizes[i].weight || 10);
        if (random <= 0) {
          stopIndex = i;
          break;
        }
      }
      myLucky.current.stop(stopIndex);
    }, 2500);
  };

  const onEnd = async (prize) => {
    const prizeName = prize.fonts[0].text;
    setWonPrize(prizeName);
    setIsSubmitting(true);
    await submitToFormspree({ type: "最终中奖", prize: prizeName });
    localStorage.setItem(`draw_daily_${fingerprint}`, 'true');
    setHasParticipated(true);
    setStep('result');
    setIsSubmitting(false);
  };

  const submitToFormspree = async (data) => {
    try {
      await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, uid: fingerprint, time: new Date().toLocaleString() }),
      });
    } catch (e) { console.error("提交失败", e); }
  };

  const PrizeStaticList = ({ ids }) => (
    <div style={{ ...styles.prizeGrid, marginTop: '15px' }}>
      {INITIAL_PRIZES.filter(p => ids.includes(p.id)).map(p => (
        <div key={p.id} style={{ ...styles.prizeItem, cursor: 'default', background: '#F9FAFB', border: 'none', transform: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={getFullImgPath(p.img)} style={{ width: '24px', height: '24px', marginRight: '8px', objectFit: 'contain' }} />
            <span>{p.name}</span>
          </div>
        </div>
      ))}
    </div>
  );

  const CustomModal = ({ title, content, onConfirm, onCancel, confirmText = "确定", cancelText = "返回修改", icon = "🎁" }) => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.modalOverlay}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={styles.modalContent}>
        <div style={{ fontSize: '44px', marginBottom: '10px' }}>{icon}</div>
        <h2 style={styles.modalTitle}>{title}</h2>
        {content}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '25px' }}>
          <button onClick={onConfirm} style={styles.btnGradient} disabled={isPreparing}>
            {isPreparing ? "同步中..." : confirmText}
          </button>
          {onCancel && <button onClick={onCancel} style={styles.btnSecondary}>{cancelText}</button>}
        </div>
      </motion.div>
    </motion.div>
  );

  return (
    <Layout title="💌情人节快乐" noFooter={true}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
        <style>{`
          @keyframes borderSparkle {
            0% { border-image-outset: 0px; filter: drop-shadow(0 0 2px rgba(255,107,107,0.2)); }
            50% { border-image-outset: 3px; filter: drop-shadow(0 0 8px rgba(255,107,107,0.5)); }
            100% { border-image-outset: 0px; filter: drop-shadow(0 0 2px rgba(255,107,107,0.2)); }
          }
          .prize-item-selected {
            position: relative;
            border: 12px solid transparent !important;
            border-image: url('data:image/svg+xml;utf8,<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 15c-1.5-2-4-2-5.5 0-1.5 2 0 5 5.5 9 5.5-4 7-7 5.5-9-1.5-2-4-2-5.5 0z" fill="%23FF6B6B"/><path d="M30 10l1.5 3h3.5l-2.5 2.5 1 3.5-3.5-2-3.5 2 1-3.5-2.5-2.5h3.5z" fill="%23FFD93D"/><path d="M25 28c-1.1-1.5-2.9-1.5-4 0-1.1 1.5 0 3.7 4 6.7 4-3 5.1-5.2 4-6.7-1.1-1.5-2.9-1.5-4 0z" stroke="%23FF92AE" stroke-width="1"/><circle cx="8" cy="32" r="1.5" fill="%23FFB3BA"/></svg>') 12 repeat;
            animation: borderSparkle 2s infinite ease-in-out;
            transform: scale(1.02);
            z-index: 2;
          }
        `}</style>
      </Head>

      <div style={styles.container}>
        <div style={styles.bgGlow} />

        <AnimatePresence mode="wait">
          {(step === 'pass1' || step === 'pass2') && (
            <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.modalOverlay}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={styles.modalContent}>
                <div style={{ fontSize: '44px' }}>{step === 'pass1' ? '💗' : '💗'}</div>
                <h2 style={styles.modalTitle}>{step === 'pass1' ? '咱们是哪天认识的呢（如20260214）' : '咱们是哪天在一起的呢'}</h2>
                <input type="text" inputMode="numeric" value={inputPass} onChange={(e) => setInputPass(e.target.value)} style={styles.input} placeholder="请输入日期" />
                <button onClick={handleVerify} style={styles.btnGradient}>确认进入</button>
              </motion.div>
            </motion.div>
          )}

          {step === 'error' && (
            <CustomModal 
              key="error" title="验证失败" icon="😭"
              content={<div style={styles.modalSubTitle}>{lastStep === 'pass1' ? '呜呜呜宝宝你记错啦' : '呜呜呜宝宝你记错啦'}</div>}
              onConfirm={() => { setStep(lastStep); setInputPass(''); }}
              confirmText="重新输入"
            />
          )}

          {(step === 'exclude' || step === 'focus') && (
            <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.modalOverlay}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={styles.modalContent}>
                <h2 style={styles.modalTitle}>{step === 'exclude' ? '回答正确！宝宝你可以排除不想要的礼物' : '回答正确！宝宝你可以选择最想要的礼物'}</h2>
                <p style={styles.modalSubTitle}>{step === 'exclude' ? '请勾选 2 个你【不想要】的' : '请勾选 2 个你【最想要】的'}</p>
                <div style={styles.prizeGrid}>
                  {(step === 'exclude' ? INITIAL_PRIZES : INITIAL_PRIZES.filter(p => !excludedIds.includes(p.id))).map(p => {
                    const isSel = step === 'exclude' ? excludedIds.includes(p.id) : focusedIds.includes(p.id);
                    return (
                      <div key={p.id} onClick={() => toggleSelect(p.id, step === 'exclude' ? excludedIds : focusedIds, step === 'exclude' ? setExcludedIds : setFocusedIds, 2)} 
                           className={isSel ? "prize-item-selected" : ""}
                           style={{ 
                             ...styles.prizeItem, 
                             borderColor: isSel ? 'transparent' : '#f0f0f0', 
                             background: isSel ? 'rgba(255,107,107,0.03)' : '#fff',
                           }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <img src={getFullImgPath(p.img)} style={{ width: '24px', height: '24px', marginRight: '10px', objectFit: 'contain' }} />
                          <span style={{ color: '#333', fontWeight: isSel ? 'bold' : 'normal' }}>{p.name}</span>
                        </div>
                        <div style={{ ...styles.checkbox, background: isSel ? '#FF6B6B' : 'transparent', borderColor: isSel ? '#FF6B6B' : '#ddd' }} />
                      </div>
                    );
                  })}
                </div>
                <button 
                  onClick={() => setStep(step === 'exclude' ? 'confirm_exclude' : 'confirm_focus')} 
                  disabled={(step === 'exclude' ? excludedIds.length : focusedIds.length) !== 2}
                  style={{ ...styles.btnGradient, opacity: (step === 'exclude' ? excludedIds.length : focusedIds.length) === 2 ? 1 : 0.4 }}>
                  下一步
                </button>
              </motion.div>
            </motion.div>
          )}

          {step === 'confirm_exclude' && (
            <CustomModal 
              key="ce" title="确定排除这些吗？" 
              content={<PrizeStaticList ids={excludedIds}/>}
              onConfirm={() => setStep('pass2')}
              onCancel={() => setStep('exclude')}
            />
          )}

          {step === 'confirm_focus' && (
            <CustomModal 
              key="cf" title="确定这就是最想要的吗？" icon="✨"
              content={<PrizeStaticList ids={focusedIds}/>}
              onConfirm={prepareWheelData}
              onCancel={() => setStep('focus')}
            />
          )}

{step === 'result' && (
  <CustomModal 
    key="res" 
    title="🎉 恭喜中奖，快截图找我领取吧" 
    icon="🌈"
    content={(
      <div style={{
        ...styles.prizeItem, 
        cursor: 'default', 
        margin: '20px 0', 
        border: '2px solid #FF6B6B', // 给中奖目标加个粉色边框
        background: '#FFF5F5', 
        transform: 'none', 
        justifyContent: 'center',
        flexDirection: 'column', // 让图片和文字上下排列，更有仪式感
        gap: '10px',
        padding: '20px'
      }}>
        {/* 动态查找奖品图片 */}
        {(() => {
          const prizeObj = INITIAL_PRIZES.find(p => p.name === wonPrize);
          return prizeObj ? (
            <img 
              src={getFullImgPath(prizeObj.img)} 
              style={{ width: '80px', height: '80px', objectFit: 'contain' }} 
              alt={wonPrize}
            />
          ) : null;
        })()}
        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#FF6B6B' }}>
          {wonPrize}
        </span>
      </div>
    )}
    onConfirm={() => setStep('wheel')}
    confirmText="太棒啦"
  />
)}

          {step === 'warning' && (
            <CustomModal 
              key="warn" title="已经抽过啦！" icon="🎉"
              content={<div style={styles.modalSubTitle}>宝宝你已经抽过了噢，你的心愿我都知道啦！</div>}
              onConfirm={() => setStep('wheel')}
              confirmText="我知道了"
            />
          )}
        </AnimatePresence>

        {step === 'wheel' && finalPrizes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', zIndex: 1 }}>
            <h1 style={styles.title}>Gina's Valentine</h1>
            <div style={styles.wheelWrapper}>
              <LuckyWheel 
                ref={myLucky} 
                width="310px" 
                height="310px"
                blocks={[{ padding: '10px', background: '#f0f0f0', borderRadius: '50%' }]}
                prizes={finalPrizes.map(p => ({
                  background: p.color,
                  fonts: [{ text: p.name, top: '10%', color: '#fff', fontWeight: 'bold', fontSize: '12px' }],
                  imgs: [{ 
                    src: p.wheelImg?.src || getFullImgPath(p.img), 
                    width: '45px', 
                    height: '45px', 
                    top: '35%' 
                  }]
                }))}
// 这里的配置对应 lucky-canvas 的 buttons 数组
buttons={[
  {
    radius: '32%', // 按钮占据的半径范围
    imgs: [
      {
        src: getFullImgPath('/gift/button.png'),
        width: '100%',  // 图片宽度，相对于 radius
        height: '110%', // 图片高度
        top: '-115%'    // 重点：根据图片素材的中心点，微调垂直位置
      }
    ]
  }
]}
                onStart={startSpin} 
                onEnd={onEnd}
              />
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}

const styles = {
  container: { minHeight: '100vh', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', touchAction: 'manipulation' },
  bgGlow: { position: 'absolute', width: '100%', height: '100%', background: 'radial-gradient(circle at 50% 10%, rgba(255,107,107,0.08) 0%, rgba(255,255,255,0) 60%)', zIndex: 0 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255, 255, 255, 0.96)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(12px)' },
  modalContent: { background: '#ffffff', padding: '35px 25px', borderRadius: '32px', textAlign: 'center', width: '90%', maxWidth: '380px', boxShadow: '0 30px 60px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.05)' },
  modalTitle: { color: '#333', marginBottom: '12px', fontWeight: '750', fontSize: '16px' },
  modalSubTitle: { color: '#666', fontSize: '15px', lineHeight: '1.5' },
  input: { width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #F0F0F0', background: '#F8F9FA', marginBottom: '20px', textAlign: 'center', outline: 'none', fontSize: '16px', boxSizing: 'border-box' },
  btnGradient: { width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E99 100%)', color: '#fff', fontWeight: 'bold', fontSize: '16px', transition: 'all 0.3s ease', cursor: 'pointer' },
  btnSecondary: { width: '100%', padding: '14px', borderRadius: '16px', border: '1px solid #DDD', background: '#F5F5F5', color: '#555', fontSize: '14px', fontWeight: '800', cursor: 'pointer' },
  prizeGrid: { display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' },
  prizeItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderRadius: '16px', border: '1px solid #f0f0f0', fontSize: '16px',transform: 'scale(1)', transition: 'all 0.3s ease' },
  checkbox: { width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #ddd' },
  title: { fontSize: '32px', letterSpacing: '6px', background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E99 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '40px', fontWeight: '900' },
  wheelWrapper: { 
  width: '340px',   // 310 (转盘) + 15*2 (左右内边距)
  height: '340px',  // 保持宽高一致
  padding: '15px', 
  background: '#fa658dd5', 
  borderRadius: '50%', 
  boxShadow: '0 20px 60px rgba(248, 66, 111, 0.67)',
  display: 'flex',     // 增加 flex 居中
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box' // 确保 padding 不会额外增加宽度
}
};