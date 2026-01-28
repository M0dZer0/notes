import React, { useState, useRef, useEffect } from 'react';
import Layout from '@theme/Layout';
import { LuckyWheel } from '@lucky-canvas/react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from '@docusaurus/Head';

const PASS_1 = "1"; 
const PASS_2 = "2"; 
const FORMSPREE_URL = "https://formspree.io/f/xqeqbogb";

const INITIAL_PRIZES = [
  { id: 1, name: '奖品 1', color: '#FF6B6B' },
  { id: 2, name: '奖品 2', color: '#FF8E99' },
  { id: 3, name: '奖品 3', color: '#FF92AE' },
  { id: 4, name: '奖品 4', color: '#FFB3BA' },
  { id: 5, name: '奖品 5', color: '#FF6B6B' },
  { id: 6, name: '奖品 6', color: '#FF8E99' },
  { id: 7, name: '奖品 7', color: '#FF92AE' },
  { id: 8, name: '奖品 8', color: '#FFB3BA' },
];

export default function LuckyWheelPage() {
  const myLucky = useRef();
  const [step, setStep] = useState('pass1'); 
  const [inputPass, setInputPass] = useState('');
  const [excludedIds, setExcludedIds] = useState([]); 
  const [focusedIds, setFocusedIds] = useState([]);   
  const [finalPrizes, setFinalPrizes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false);
  const [fingerprint, setFingerprint] = useState('');

  useEffect(() => {
    const id = btoa([navigator.userAgent, screen.width].join('|')).substring(0, 12);
    setFingerprint(id);
    if (localStorage.getItem(`draw_v3_${id}`)) setHasParticipated(true);
  }, []);

  const submitToFormspree = async (data) => {
    try {
      await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, uid: fingerprint, time: new Date().toLocaleString() }),
      });
    } catch (e) { console.error("提交失败", e); }
  };

  const handleVerify = () => {
    if (step === 'pass1') {
      if (inputPass === PASS_1) { setStep('exclude'); setInputPass(''); }
      else alert("密码 1 错误");
    } else if (step === 'pass2') {
      if (inputPass === PASS_2) { setStep('focus'); setInputPass(''); }
      else alert("密码 2 错误");
    }
  };

  const toggleSelect = (id, list, setList, max) => {
    if (list.includes(id)) setList(list.filter(i => i !== id));
    else if (list.length < max) setList([...list, id]);
  };

  const confirmExclude = async () => {
    if (excludedIds.length !== 2) return;
    const names = INITIAL_PRIZES.filter(p => excludedIds.includes(p.id)).map(p => p.name);
    submitToFormspree({ type: "排除选择", prizes: names });
    setStep('pass2');
  };

  const confirmFocus = () => {
    if (focusedIds.length !== 2) return;
    const remaining = INITIAL_PRIZES.filter(p => !excludedIds.includes(p.id));
    const names = remaining.filter(p => focusedIds.includes(p.id)).map(p => p.name);
    submitToFormspree({ type: "最想要选择", prizes: names });
    const weightedPrizes = remaining.map(p => ({
      ...p, weight: focusedIds.includes(p.id) ? 30 : 10
    }));
    setFinalPrizes(weightedPrizes);
    setStep('wheel');
  };

  const startSpin = () => {
    if (hasParticipated || isSubmitting) return;
    myLucky.current.play();
    setTimeout(() => {
      const totalWeight = finalPrizes.reduce((sum, p) => sum + p.weight, 0);
      let random = Math.random() * totalWeight;
      for (let i = 0; i < finalPrizes.length; i++) {
        random -= finalPrizes[i].weight;
        if (random <= 0) { myLucky.current.stop(i); break; }
      }
    }, 2500);
  };

  const onEnd = async (prize) => {
    const prizeName = prize.fonts[0].text;
    setIsSubmitting(true);
    await submitToFormspree({ type: "最终中奖", prize: prizeName });
    localStorage.setItem(`draw_v3_${fingerprint}`, 'true');
    setHasParticipated(true);
    alert(`🎉 恭喜获得：${prizeName}！`);
    setIsSubmitting(false);
  };

  return (
    <Layout title="幸运抽奖" noFooter={true}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
        <style>{`
          /* 核心修改：复杂的爱心与星星组合边框 */
          .prize-item-selected {
            position: relative;
            border: 12px solid transparent !important;
            /* 包含：实心爱心、镂空爱心、五角星 */
            border-image: url('data:image/svg+xml;utf8,<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 15c-1.5-2-4-2-5.5 0-1.5 2 0 5 5.5 9 5.5-4 7-7 5.5-9-1.5-2-4-2-5.5 0z" fill="%23FF6B6B"/><path d="M30 10l1.5 3h3.5l-2.5 2.5 1 3.5-3.5-2-3.5 2 1-3.5-2.5-2.5h3.5z" fill="%23FFD93D"/><path d="M25 28c-1.1-1.5-2.9-1.5-4 0-1.1 1.5 0 3.7 4 6.7 4-3 5.1-5.2 4-6.7-1.1-1.5-2.9-1.5-4 0z" stroke="%23FF92AE" stroke-width="1"/><circle cx="8" cy="32" r="1.5" fill="%23FFB3BA"/></svg>') 12 repeat;
            animation: borderSparkle 2s infinite ease-in-out;
          }

          @keyframes borderSparkle {
            0% { border-image-outset: 0px; filter: drop-shadow(0 0 2px rgba(255,107,107,0.2)); }
            50% { border-image-outset: 3px; filter: drop-shadow(0 0 8px rgba(255,107,107,0.5)); }
            100% { border-image-outset: 0px; filter: drop-shadow(0 0 2px rgba(255,107,107,0.2)); }
          }
        `}</style>
      </Head>

      <div style={styles.container}>
        <div style={styles.bgGlow} />

        <AnimatePresence mode="wait">
          {(step === 'pass1' || step === 'pass2') && (
            <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.modalOverlay}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={styles.modalContent}>
                <div style={{ fontSize: '44px' }}>{step === 'pass1' ? '🔐' : '🔑'}</div>
                <h2 style={styles.modalTitle}>{step === 'pass1' ? '验证码 1' : '验证码 2'}</h2>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={inputPass} 
                  onChange={(e) => setInputPass(e.target.value)} 
                  style={styles.input} 
                  placeholder="请输入验证码" 
                />
                <button onClick={handleVerify} style={styles.btnGradient}>确认进入</button>
              </motion.div>
            </motion.div>
          )}

          {(step === 'exclude' || step === 'focus') && (
            <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.modalOverlay}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={styles.modalContent}>
                <h2 style={styles.modalTitle}>{step === 'exclude' ? '排除奖品' : '核心愿望'}</h2>
                <p style={styles.modalSubTitle}>{step === 'exclude' ? '请勾选 2 个你【不想要】的' : '请勾选 2 个你【最想要】的'}</p>
                <div style={styles.prizeGrid}>
                  {(step === 'exclude' ? INITIAL_PRIZES : INITIAL_PRIZES.filter(p => !excludedIds.includes(p.id))).map(p => {
                    const isSel = step === 'exclude' ? excludedIds.includes(p.id) : focusedIds.includes(p.id);
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => toggleSelect(p.id, step === 'exclude' ? excludedIds : focusedIds, step === 'exclude' ? setExcludedIds : setFocusedIds, 2)} 
                        className={isSel ? "prize-item-selected" : ""}
                        style={{ 
                          ...styles.prizeItem, 
                          position: 'relative',
                          borderColor: isSel ? 'transparent' : '#f0f0f0', 
                          background: isSel ? 'rgba(255,107,107,0.03)' : '#fff',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ marginRight: '10px' }}>🎁</span>
                          <span style={{ color: '#333', fontWeight: isSel ? 'bold' : 'normal' }}>{p.name}</span>
                        </div>
                        <div style={{ ...styles.checkbox, background: isSel ? '#FF6B6B' : 'transparent', borderColor: isSel ? '#FF6B6B' : '#ddd' }} />
                      </div>
                    );
                  })}
                </div>
                <button onClick={step === 'exclude' ? confirmExclude : confirmFocus} 
                        style={{ ...styles.btnGradient, opacity: (step === 'exclude' ? excludedIds.length : focusedIds.length) === 2 ? 1 : 0.4 }}>
                  下一步
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {step === 'wheel' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', zIndex: 1 }}>
            <h1 style={styles.title}>LUCKY WHEEL</h1>
            <div style={styles.wheelWrapper}>
              <LuckyWheel ref={myLucky} width="310px" height="310px"
                blocks={[{ padding: '10px', background: '#F0F0F0', borderRadius: '50%' }]}
                prizes={finalPrizes.map(p => ({
                  background: p.color,
                  fonts: [{ text: p.name, top: '15%', color: '#fff', fontWeight: 'bold', fontSize: '14px' }]
                }))}
                buttons={[{
                  radius: '35%', background: '#fff', pointer: true,
                  fonts: [{ text: 'GO', color: '#FF6B6B', top: '-10px', fontWeight: '900', fontSize: '18px' }]
                }]}
                onStart={startSpin} onEnd={onEnd}
              />
            </div>
            {hasParticipated && <p style={styles.warnText}>您今日已参与 ✨</p>}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}

const styles = {
  container: { minHeight: '100vh', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', touchAction: 'manipulation' },
  bgGlow: { position: 'absolute', width: '100%', height: '100%', background: 'radial-gradient(circle at 50% 10%, rgba(255,107,107,0.08) 0%, rgba(255,255,255,0) 60%)', zIndex: 0 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255, 255, 255, 0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' },
  modalContent: { background: '#ffffff', padding: '35px 25px', borderRadius: '32px', textAlign: 'center', width: '90%', maxWidth: '380px', boxShadow: '0 30px 60px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.02)' },
  modalTitle: { color: '#333', marginBottom: '5px', fontWeight: '900', fontSize: '24px' },
  modalSubTitle: { color: '#999', marginBottom: '25px', fontSize: '14px' },
  input: { width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #F0F0F0', background: '#F8F9FA', marginBottom: '20px', textAlign: 'center', outline: 'none', fontSize: '16px', boxSizing: 'border-box' },
  btnGradient: { width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E99 100%)', color: '#fff', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' },
  prizeGrid: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px', maxHeight: '300px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '10px 5px' },
  prizeItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderRadius: '16px', border: '1px solid #f0f0f0', cursor: 'pointer', fontSize: '16px', transition: 'all 0.3s ease' },
  checkbox: { width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #ddd', transition: 'all 0.2s' },
  title: { fontSize: '32px', letterSpacing: '6px', background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E99 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '40px', fontWeight: '900' },
  wheelWrapper: { padding: '15px', background: '#fff', borderRadius: '50%', boxShadow: '0 20px 60px rgba(0,0,0,0.06)' },
  warnText: { marginTop: '25px', color: '#FF6B6B', fontWeight: 'bold' }
};