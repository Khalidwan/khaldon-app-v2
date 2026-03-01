/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, 
  Image as ImageIcon, 
  Coins, 
  Download, 
  AlertCircle, 
  Trash2, 
  Home, 
  Compass, 
  Plus, 
  UploadCloud, 
  X,
  Share2,
  Facebook,
  ExternalLink,
  MessageCircle,
  Twitter,
  Copy,
  Check,
  CreditCard,
  Zap
} from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

type Tab = 'home' | 'studio' | 'gallery' | 'community';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('studio');
  const [prompt, setPrompt] = useState('');
  const [points, setPoints] = useState(() => {
    const savedPoints = localStorage.getItem('khaldon_points');
    return savedPoints ? parseInt(savedPoints, 10) : 100;
  });
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>(() => {
    const savedImages = localStorage.getItem('khaldon_images');
    return savedImages ? JSON.parse(savedImages) : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [hasFollowed, setHasFollowed] = useState(() => {
    return localStorage.getItem('khaldon_has_followed') === 'true';
  });
  const [shareConfirmation, setShareConfirmation] = useState<GeneratedImage | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [recentlyShared, setRecentlyShared] = useState<string[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [dailyGenerations, setDailyGenerations] = useState(() => {
    const savedDate = localStorage.getItem('khaldon_last_generation_date');
    const today = new Date().toISOString().split('T')[0];
    if (savedDate !== today) {
      return 0;
    }
    const savedCount = localStorage.getItem('khaldon_daily_generations');
    return savedCount ? parseInt(savedCount, 10) : 0;
  });
  const [lastGeneratedImage, setLastGeneratedImage] = useState<GeneratedImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldown]);

  useEffect(() => {
    localStorage.setItem('khaldon_points', points.toString());
  }, [points]);

  useEffect(() => {
    localStorage.setItem('khaldon_daily_generations', dailyGenerations.toString());
    localStorage.setItem('khaldon_last_generation_date', new Date().toISOString().split('T')[0]);
  }, [dailyGenerations]);

  useEffect(() => {
    localStorage.setItem('khaldon_images', JSON.stringify(images));
  }, [images]);

  useEffect(() => {
    localStorage.setItem('khaldon_has_followed', hasFollowed.toString());
  }, [hasFollowed]);

  const COST_PER_IMAGE = 10;
  const SHARE_REWARD = 10;
  const FOLLOW_REWARD = 50;
  const DAILY_LIMIT = 5;

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generateImage = async () => {
    if (!prompt.trim() && !selectedImage) return;
    
    if (dailyGenerations >= DAILY_LIMIT) {
      setError(`عذراً، لقد وصلت للحد اليومي (${DAILY_LIMIT} صور). يرجى العودة غداً.`);
      return;
    }

    if (points < COST_PER_IMAGE) {
      setError('عذراً، رصيدك غير كافٍ لتوليد الصورة.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setPoints(prev => prev - COST_PER_IMAGE);
      setDailyGenerations(prev => prev + 1);

      // Ensure prompt is not empty if image is selected
      const userPrompt = prompt.trim();
      // Force the model to generate an image by being explicit
      const effectivePrompt = userPrompt 
        ? `Generate an image of: ${userPrompt}` 
        : (selectedImage ? "Generate a variation of this image" : "Generate a creative image");
      
      const parts: any[] = [{ text: effectivePrompt }];
      
      if (selectedImage) {
        // Extract base64 data and mime type
        const [header, base64Data] = selectedImage.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
        
        parts.unshift({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }

      const generateWithRetry = async (retries = 3, delay = 2000) => {
        try {
          return await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
          });
        } catch (e: any) {
          const errStr = JSON.stringify(e);
          if (retries > 0 && (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED'))) {
            console.log(`Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateWithRetry(retries - 1, delay * 2);
          }
          throw e;
        }
      };

      console.log("Generating with parts:", parts);

      const response = await generateWithRetry();

      console.log("Generation response:", response);

      let imageUrl = null;
      let textOutput = null;
      
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            imageUrl = `data:image/png;base64,${base64EncodeString}`;
            break;
          } else if (part.text) {
            textOutput = part.text;
          }
        }
      }

      if (imageUrl) {
        const newImage: GeneratedImage = {
          id: Date.now().toString(),
          url: imageUrl,
          prompt: prompt || 'صورة معدلة',
          timestamp: Date.now(),
        };
        setImages(prev => [newImage, ...prev]);
        setPrompt('');
        clearSelectedImage();
        setActiveTab('gallery'); // Switch to gallery to see result
      } else {
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY') {
          throw new Error('تم رفض الطلب بسبب معايير السلامة. يرجى تعديل الوصف أو الصورة.');
        }
        
        if (textOutput) {
          console.error("Model text output:", textOutput);
          throw new Error(`لم يتم توليد صورة: ${textOutput.slice(0, 100)}...`);
        }
        throw new Error('لم يتم استلام صورة من النموذج. حاول تغيير الوصف.');
      }

    } catch (err: any) {
      console.error("Error generating image:", err);
      let errorMessage = 'حدث خطأ أثناء التوليد. تأكد من الاتصال أو حاول مرة أخرى.';
      
      // Check for specific error types
      let errObj = err;
      if (typeof err === 'string') {
        try {
            errObj = JSON.parse(err);
        } catch (e) {
            // ignore
        }
      }

      const errString = JSON.stringify(err);
      const errMessage = errObj.message || errObj.error?.message || (typeof err === 'string' ? err : '');
      
      if (
        errMessage.includes('SAFETY') || 
        errString.includes('SAFETY') ||
        errObj.error?.details?.[0]?.reason === 'SAFETY'
      ) {
        errorMessage = 'تم رفض الطلب بسبب معايير السلامة. يرجى تعديل الوصف أو الصورة.';
      } else if (
        errMessage.includes('429') || 
        errMessage.includes('RESOURCE_EXHAUSTED') || 
        errString.includes('429') || 
        errString.includes('RESOURCE_EXHAUSTED') ||
        errObj.status === 429 ||
        errObj.error?.code === 429
      ) {
        errorMessage = 'عذراً، تم تجاوز الحد المسموح به من الطلبات. يرجى الانتظار قليلاً.';
        setCooldown(60); // Set 60 seconds cooldown
      } else if (errMessage) {
        // Clean up common error prefixes
        errorMessage = errMessage.replace(/\[.*?\]\s*/, '').slice(0, 100);
      }
      
      setError(errorMessage);
      setPoints(prev => prev + COST_PER_IMAGE);
      setDailyGenerations(prev => Math.max(0, prev - 1));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (imageUrl: string, id: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `khaldon-${id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = (img: GeneratedImage) => {
    if (recentlyShared.includes(img.id)) return;
    setShareConfirmation(img);
  };

  const handleSocialShare = (platform: 'whatsapp' | 'facebook' | 'twitter' | 'copy') => {
    if (!shareConfirmation) return;
    const img = shareConfirmation;
    const text = `شاهد هذه الصورة التي صنعتها باستخدام تطبيق خلدون: ${img.prompt}`;
    const url = window.location.href;

    let shareUrl = '';
    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        break;
      case 'copy':
        navigator.clipboard.writeText(`${text} ${url}`);
        showNotification('تم نسخ الرابط والنص!');
        return;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank');
      // Reward for social sharing too
      if (!recentlyShared.includes(img.id)) {
        setPoints(prev => prev + SHARE_REWARD);
        showNotification(`تم إضافة ${SHARE_REWARD} نقطة لرصيدك! 🎉`);
        setRecentlyShared(prev => [...prev, img.id]);
      }
    }
    setShareConfirmation(null);
  };

  const confirmShare = async () => {
    if (!shareConfirmation) return;
    
    setIsSharing(true);
    const img = shareConfirmation;

    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const file = new File([blob], `khaldon-${img.id}.png`, { type: 'image/png' });
      
      const shareData = {
        title: 'Khaldon AI',
        text: `شاهد هذه الصورة التي صنعتها باستخدام تطبيق خلدون: ${img.prompt}`,
        files: [file]
      };

      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        if (!recentlyShared.includes(img.id)) {
          setPoints(prev => prev + SHARE_REWARD);
          showNotification(`تم إضافة ${SHARE_REWARD} نقطة لرصيدك! 🎉`);
          setRecentlyShared(prev => [...prev, img.id]);
        }
      } else {
        // Fallback: Download image
        handleDownload(img.url, img.id);
        showNotification('تم تحميل الصورة. يمكنك مشاركتها الآن!');
        
        // Also try to copy image to clipboard
        try {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            showNotification('تم نسخ الصورة للحافظة!');
        } catch (e) {
            // Ignore clipboard error
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error("Share failed:", error);
        setError("حدث خطأ أثناء المشاركة");
      }
    } finally {
      setIsSharing(false);
      setShareConfirmation(null);
    }
  };

  const handleFollow = () => {
    window.open('https://www.facebook.com/profile.php?id=61552591466332', '_blank');
    
    if (!hasFollowed) {
      setPoints(prev => prev + FOLLOW_REWARD);
      setHasFollowed(true);
      showNotification(`تم إضافة ${FOLLOW_REWARD} نقطة لرصيدك! 🎉`);
    }
  };

  const deleteImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white font-sans pb-24" dir="rtl">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-bold border border-emerald-400/30"
          >
            <div className="bg-white/20 p-1.5 rounded-full">
              <Coins size={18} className="text-yellow-300 fill-yellow-300" />
            </div>
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Confirmation Dialog */}
      <AnimatePresence>
        {shareConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => !isSharing && setShareConfirmation(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#151A2D] p-6 rounded-2xl border border-white/10 max-w-sm w-full space-y-4 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-indigo-600/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Share2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-white">مشاركة الصورة</h3>
                <p className="text-slate-400">
                  هل تريد مشاركة هذه الصورة؟ ستحصل على <span className="text-yellow-400 font-bold">{SHARE_REWARD} نقطة</span> عند إتمام المشاركة!
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={confirmShare}
                  disabled={isSharing}
                  className="w-full py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSharing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>مشاركة الصورة</span>
                      <Share2 size={18} />
                    </>
                  )}
                </button>

                <div className="grid grid-cols-4 gap-2">
                  <button onClick={() => handleSocialShare('whatsapp')} className="p-3 rounded-xl bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 flex items-center justify-center transition-colors">
                    <MessageCircle size={20} />
                  </button>
                  <button onClick={() => handleSocialShare('facebook')} className="p-3 rounded-xl bg-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/30 flex items-center justify-center transition-colors">
                    <Facebook size={20} />
                  </button>
                  <button onClick={() => handleSocialShare('twitter')} className="p-3 rounded-xl bg-[#1DA1F2]/20 text-[#1DA1F2] hover:bg-[#1DA1F2]/30 flex items-center justify-center transition-colors">
                    <Twitter size={20} />
                  </button>
                  <button onClick={() => handleSocialShare('copy')} className="p-3 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center justify-center transition-colors">
                    <Copy size={20} />
                  </button>
                </div>

                <button
                  onClick={() => setShareConfirmation(null)}
                  disabled={isSharing}
                  className="w-full py-3 rounded-xl font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50 mt-2"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header className="bg-[#0B0F19]/90 backdrop-blur-md sticky top-0 z-20 border-b border-white/5">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20">
              K
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">خلدون</h1>
              <span className="text-[10px] text-slate-400 tracking-widest uppercase">Nano B Studio</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-[#151A2D] px-3 py-1.5 rounded-full border border-white/5">
            <button className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-500 transition-colors">
              <Plus size={12} />
            </button>
            <span className="font-bold text-sm">{points}</span>
            <span className="text-[10px] text-slate-400">نقطة</span>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        <AnimatePresence mode="wait">
          {activeTab === 'studio' && (
            <motion.div 
              key="studio"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Error Message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3 text-sm"
                  >
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={`grid gap-4 ${selectedImage ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {/* Prompt Input */}
                <div className={`bg-[#151A2D] p-1 rounded-2xl border border-white/5 shadow-xl ${selectedImage ? 'order-2 h-full' : 'order-1'}`}>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="صف الصورة التي تريد تخيلها..."
                    className={`w-full p-4 bg-transparent text-white placeholder-slate-500 outline-none resize-none text-base ${selectedImage ? 'h-full min-h-[160px]' : 'h-32'}`}
                    disabled={loading}
                  />
                  <div className="px-4 pb-2 text-xs text-slate-500 flex justify-between items-center">
                    <span>{prompt.length} حرف</span>
                    <span className={`${dailyGenerations >= DAILY_LIMIT ? 'text-red-400' : 'text-indigo-400'}`}>
                      المحاولات اليومية: {dailyGenerations}/{DAILY_LIMIT}
                    </span>
                  </div>
                </div>

                {/* Visual Reference Upload */}
                <div className={`space-y-2 ${selectedImage ? 'order-1' : 'order-2'}`}>
                  {!selectedImage && <h3 className="text-sm text-slate-400 font-medium px-1">المرجع البصري (اختياري)</h3>}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="relative group cursor-pointer h-full"
                  >
                    <div className={`
                      w-full rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3
                      ${selectedImage 
                        ? 'border-indigo-500/50 bg-[#151A2D] h-full min-h-[160px]' 
                        : 'border-white/10 bg-[#151A2D]/50 hover:bg-[#151A2D] hover:border-white/20 h-40'}
                    `}>
                      {selectedImage ? (
                        <div className="relative w-full h-full p-2">
                          <img 
                            src={selectedImage} 
                            alt="Reference" 
                            className="w-full h-full object-cover rounded-xl"
                          />
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              clearSelectedImage();
                            }}
                            className="absolute top-4 right-4 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <UploadCloud size={24} className="text-slate-400" />
                          </div>
                          <p className="text-sm text-slate-500">حدد صورة لتحديد النمط أو الخلفية</p>
                        </>
                      )}
                    </div>
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={generateImage}
                disabled={loading || (!prompt.trim() && !selectedImage) || cooldown > 0}
                className={`
                  w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20
                  ${loading || (!prompt.trim() && !selectedImage) || cooldown > 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'}
                `}
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري المعالجة...
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <AlertCircle size={20} />
                    يرجى الانتظار {cooldown} ثانية
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    توليد الصورة
                  </>
                )}
              </button>

              {/* Last Generated Image Result */}
              <AnimatePresence>
                {lastGeneratedImage && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-[#151A2D] p-4 rounded-2xl border border-white/10 shadow-2xl mt-6"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <Check size={18} className="text-emerald-400" />
                        تم التوليد بنجاح
                      </h3>
                      <button 
                        onClick={() => setLastGeneratedImage(null)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    
                    <div className="relative rounded-xl overflow-hidden aspect-square mb-4 group">
                      <img 
                        src={lastGeneratedImage.url} 
                        alt={lastGeneratedImage.prompt} 
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleShare(lastGeneratedImage)}
                        className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2"
                      >
                        <span>مشاركة</span>
                        <Share2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDownload(lastGeneratedImage.url, lastGeneratedImage.id)}
                        className="flex-1 py-3 rounded-xl font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <span>تحميل</span>
                        <Download size={18} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'gallery' && (
            <motion.div 
              key="gallery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold px-1">معرضي</h2>
              <div className="grid grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {images.length === 0 ? (
                    <div className="col-span-2 py-20 text-center text-slate-500">
                      <ImageIcon size={48} className="mx-auto mb-4 opacity-20" />
                      <p>لا توجد صور محفوظة</p>
                    </div>
                  ) : (
                    images.map((img) => (
                      <motion.div
                        key={img.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="group relative bg-[#151A2D] rounded-xl overflow-hidden border border-white/5 flex flex-col"
                      >
                        <div className="aspect-square relative overflow-hidden">
                          <img 
                            src={img.url} 
                            alt={img.prompt}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-2 flex items-center justify-between gap-2 bg-[#151A2D]">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleShare(img)}
                              disabled={recentlyShared.includes(img.id)}
                              className={`
                                p-2 rounded-lg text-white transition-colors
                                ${recentlyShared.includes(img.id) 
                                  ? 'bg-slate-800 cursor-not-allowed text-slate-500' 
                                  : 'bg-indigo-600 hover:bg-indigo-500'}
                              `}
                              title={recentlyShared.includes(img.id) ? "تمت المشاركة مؤخراً" : "مشاركة (+10 نقاط)"}
                            >
                              <Share2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDownload(img.url, img.id)}
                              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                            >
                              <Download size={16} />
                            </button>
                          </div>
                          <button 
                            onClick={() => deleteImage(img.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {activeTab === 'community' && (
            <motion.div 
              key="community"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-bold px-1">مجتمع خلدون</h2>
              
              <div className="bg-[#151A2D] p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white mb-2 shadow-lg shadow-blue-900/20">
                  <Facebook size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">تابعنا على فيسبوك</h3>
                  <p className="text-slate-400 text-sm mt-1">انضم لمجتمعنا واحصل على 50 نقطة مجانية!</p>
                </div>
                <button 
                  onClick={handleFollow}
                  className={`
                    px-6 py-3 rounded-xl font-medium transition-colors w-full flex items-center justify-center gap-2
                    ${hasFollowed 
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'}
                  `}
                >
                  {hasFollowed ? (
                    <span>تمت المتابعة (شكراً لك)</span>
                  ) : (
                    <span>متابعة +50 نقطة</span>
                  )}
                  <ExternalLink size={16} />
                </button>
              </div>

              <div className="bg-[#151A2D]/50 p-6 rounded-2xl border border-white/5 text-center">
                <p className="text-slate-500 text-sm">المزيد من الميزات الاجتماعية قادمة قريباً...</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8 pb-10"
            >
              <div className="text-center space-y-2 pt-8">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  اشحن رصيدك
                </h2>
                <p className="text-slate-400">احصل على المزيد من النقاط لتوليد صور إبداعية</p>
              </div>

              <div className="grid gap-4">
                {/* Package 1 */}
                <div className="bg-[#151A2D] p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
                  <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">
                    الأكثر طلباً
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Coins size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">100 نقطة</h3>
                        <p className="text-slate-400 text-xs">تكفي لـ 10 صور</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-white">$3.00</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      window.open('https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=khalidha9i9i@gmail.com&currency_code=USD&amount=3&item_name=100%20Khaldon%20Points', '_blank');
                      // Simulate adding points for demo purposes after a delay/confirmation
                      if (confirm("هل أتممت عملية الدفع بنجاح؟\n(سيتم إضافة النقاط تلقائياً في النسخة النهائية، اضغط موافق لإضافتها الآن للتجربة)")) {
                        setPoints(prev => prev + 100);
                        showNotification("تم إضافة 100 نقطة لرصيدك! 🎉");
                      }
                    }}
                    className="w-full py-3 rounded-xl font-bold bg-white text-black hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>شراء الآن</span>
                    <CreditCard size={16} />
                  </button>
                </div>

                {/* Package 2 */}
                <div className="bg-[#151A2D] p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-purple-500/50 transition-colors">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                        <Zap size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">250 نقطة</h3>
                        <p className="text-slate-400 text-xs">تكفي لـ 25 صورة</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-white">$6.00</span>
                      <p className="text-green-400 text-[10px]">توفير 20%</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      window.open('https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=khalidha9i9i@gmail.com&currency_code=USD&amount=6&item_name=250%20Khaldon%20Points', '_blank');
                      if (confirm("هل أتممت عملية الدفع بنجاح؟")) {
                        setPoints(prev => prev + 250);
                        showNotification("تم إضافة 250 نقطة لرصيدك! 🎉");
                      }
                    }}
                    className="w-full py-3 rounded-xl font-bold bg-purple-600 text-white hover:bg-purple-500 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>شراء الآن</span>
                    <CreditCard size={16} />
                  </button>
                </div>

                {/* Package 3 */}
                <div className="bg-[#151A2D] p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-amber-500/50 transition-colors">
                  <div className="absolute top-0 right-0 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-bl-xl">
                    أفضل قيمة
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Coins size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">500 نقطة</h3>
                        <p className="text-slate-400 text-xs">تكفي لـ 50 صورة</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-white">$10.00</span>
                      <p className="text-green-400 text-[10px]">توفير 33%</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      window.open('https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=khalidha9i9i@gmail.com&currency_code=USD&amount=10&item_name=500%20Khaldon%20Points', '_blank');
                      if (confirm("هل أتممت عملية الدفع بنجاح؟")) {
                        setPoints(prev => prev + 500);
                        showNotification("تم إضافة 500 نقطة لرصيدك! 🎉");
                      }
                    }}
                    className="w-full py-3 rounded-xl font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>شراء الآن</span>
                    <CreditCard size={16} />
                  </button>
                </div>
              </div>

              <div className="text-center text-xs text-slate-500 px-4">
                <p>يتم الدفع بشكل آمن عبر PayPal. في حال واجهت أي مشكلة، يرجى التواصل معنا.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0B0F19]/90 backdrop-blur-xl border-t border-white/5 pb-safe z-50">
        <div className="max-w-md mx-auto px-2 h-20 flex items-center justify-around">
          <NavButton 
            active={activeTab === 'home'} 
            onClick={() => setActiveTab('home')}
            icon={<Home size={24} />}
            label="الرئيسية"
          />
          <NavButton 
            active={activeTab === 'studio'} 
            onClick={() => setActiveTab('studio')}
            icon={<Sparkles size={24} />}
            label="الاستوديو"
            isMain
          />
          <NavButton 
            active={activeTab === 'gallery'} 
            onClick={() => setActiveTab('gallery')}
            icon={<ImageIcon size={24} />}
            label="معرضي"
          />
          <NavButton 
            active={activeTab === 'community'} 
            onClick={() => setActiveTab('community')}
            icon={<Compass size={24} />}
            label="المجتمع"
          />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, isMain }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, isMain?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-2xl transition-all
        ${active ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}
      `}
    >
      {active && (
        <motion.div 
          layoutId="nav-glow"
          className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full"
        />
      )}
      <div className={`
        relative z-10 transition-transform duration-300
        ${active ? 'scale-110' : 'scale-100'}
        ${isMain && active ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]' : ''}
      `}>
        {icon}
      </div>
      <span className="text-[10px] font-medium relative z-10">{label}</span>
    </button>
  );
}

