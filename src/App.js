import React, { useState, useEffect } from 'react';
import { Video, Search, Menu, X, Sun, Moon, FileText, Clock, Zap, History, Sparkles, Trash2, Copy, CheckCircle, Users, Volume2, VolumeX, Star, RefreshCw, ChevronDown, ChevronUp, Layers } from 'lucide-react';

export default function YouTubeSummarizer() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryLevel, setSummaryLevel] = useState('medium');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [readingTime, setReadingTime] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    if (summary) {
      const words = summary.split(' ').length;
      setReadingTime(Math.ceil(words / 200));
    }
  }, [summary]);

  const extractVideoId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const getVideoInfo = async (videoId) => {
    try {
      const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
      const data = await response.json();
      return { title: data.title, author: data.author_name };
    } catch (err) {
      return null;
    }
  };

  const getVideoTranscript = async (videoId) => {
    const apiKey = process.env.REACT_APP_YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn('YouTube API key not found - skipping transcript fetch');
      return null;
    }
    try {
      // List caption tracks
      const tracksResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`
      );
      const tracksData = await tracksResponse.json();
      if (!tracksData.items || tracksData.items.length === 0) {
        console.log('No captions available');
        return null;
      }

      // Prefer English track
      const trackId = tracksData.items.find(item => item.snippet.language === 'en')?.id || tracksData.items[0].id;
      if (!trackId) return null;

      // Download transcript as SRT
      const transcriptResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/captions/${trackId}?tfmt=srt&key=${apiKey}`
      );
      const transcript = await transcriptResponse.text();
      if (!transcript || transcript.trim().length < 10) {  // Arbitrary min length
        console.log('Empty/invalid transcript - unavailable');
        return null;
      }
      console.log('Transcript fetched successfully, length:', transcript.length);
      return transcript;
    } catch (err) {
      console.error('Transcript fetch failed:', err);
      return null;
    }
  };

  const summarizeWithAI = async (videoId, level, info, transcript = '') => {
    const prompts = {
      brief: 'Provide a 2-3 sentence summary explaining what this video teaches.',
      medium: 'Write a 2-3 paragraph summary covering main topics, what viewers learn, and who should watch.',
      detailed: 'Write a 4-5 paragraph comprehensive analysis including detailed concepts, takeaways, and target audience.'
    };

    const transcriptSnippet = transcript ? transcript.substring(0, 4000) : 'No transcript available.';
    const context = `Analyze this YouTube video:

TITLE: "${info?.title || 'Unknown Title'}"
CHANNEL: "${info?.author || 'Unknown Channel'}"

${transcript ? `TRANSCRIPT EXCERPT: ${transcriptSnippet}` : ''}

${prompts[level]}

Be specific about content based on the title and transcript (if available). Write directly without preamble.`;

    const geminiKey = process.env.REACT_APP_GEMINI_API_KEY;
    
    if (geminiKey) {
      try {
        console.log('Calling Gemini API...');
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: context }] }],
            generationConfig: { 
              temperature: 0.8, 
              maxOutputTokens: 2048,
              topP: 0.95
            }
          })
        });

        console.log('Response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('Response received:', !!data.candidates);
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const summary = data.candidates[0].content.parts[0].text.trim();
            console.log('✅ SUCCESS! Summary length:', summary.length);
            return summary;
          }
        } else {
          let errorData = {};
          let fullText = '';
          try {
            const clonedResponse = response.clone();  // Clone for dual reads
            errorData = await clonedResponse.json();
            fullText = await response.text();
          } catch (parseErr) {
            fullText = await response.text();  // Fallback
          }
          console.error('❌ API Error:', errorData);
          console.error('Full response:', fullText);
          throw new Error(`Gemini API failed: ${errorData.error?.message || response.statusText}`);
        }
      } catch (err) {
        console.error('❌ API exception:', err);
        throw err; // Re-throw to handle in caller
      }
    } else {
      console.warn('⚠️ No API key found - using fallback');
    }

    // Fallback
    console.log('Using fallback summary');
    const title = info?.title || 'this video';
    const channel = info?.author || 'the creator';
    
    if (level === 'brief') {
      return `"${title}" by ${channel} explains the topic in a clear, concise manner, covering the key concepts and providing valuable insights for viewers.`;
    } else if (level === 'medium') {
      return `"${title}" by ${channel} provides comprehensive coverage of the subject. The video explores the main concepts, explains important details, and offers practical knowledge that viewers can apply. This content is valuable for anyone interested in learning more about this topic.`;
    } else {
      return `"${title}" is a detailed video by ${channel} that thoroughly explores the subject matter. The content covers fundamental concepts, provides in-depth explanations, and offers practical insights that enhance understanding. The presentation is structured to progressively build knowledge, making it accessible for various skill levels. This video serves as a valuable resource for viewers seeking to deepen their expertise in this area.`;
    }
  };

  const handleSummarize = async () => {
    setError('');
    const id = extractVideoId(url);
    if (!id) {
      setError('Invalid YouTube URL');
      return;
    }

    console.log('🚀 Starting summarization for video:', id);

    setVideoId('');
    setSummary('');
    setVideoInfo(null);
    setShowSuccess(false);
    setLoading(true);

    try {
      setLoadingProgress('Fetching video information...');
      const info = await getVideoInfo(id);
      console.log('📹 Video info:', info);
      setVideoInfo(info);
      setVideoId(id);

      setLoadingProgress('Fetching transcript...');
      const transcript = await getVideoTranscript(id);
      console.log('📄 Transcript available:', !!transcript, 'Length:', transcript?.length || 0);

      setLoadingProgress('Generating AI summary...');
      console.log('🤖 Calling summarizeWithAI...');
      const generatedSummary = await summarizeWithAI(id, summaryLevel, info, transcript);
      console.log('📝 Summary received, length:', generatedSummary.length);
      
      setSummary(generatedSummary);
      setShowSuccess(true);
      
      const newHistoryItem = {
        id, url,
        timestamp: new Date().toISOString(),
        level: summaryLevel,
        title: info?.title || 'Unknown Video',
        isFavorite: false
      };
      setHistory(prev => [newHistoryItem, ...prev.slice(0, 19)]);
    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
      setLoadingProgress('');
    }
  };

  const toggleFavorite = (index) => {
    setHistory(prev => prev.map((item, i) => 
      i === index ? { ...item, isFavorite: !item.isFavorite } : item
    ));
  };

  const clearHistory = () => {
    if (window.confirm('Clear all history?')) setHistory([]);
  };

  const clearHistoryItem = (index) => {
    setHistory(prev => prev.filter((_, i) => i !== index));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startReading = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(summary);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
      setIsReading(true);
      utterance.onend = () => setIsReading(false);
    }
  };

  const stopReading = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsReading(false);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark bg-gray-900' : 'bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50'}`}>
      {/* Sidebar */}
      <div className={`fixed top-0 left-0 h-full w-80 bg-white dark:bg-gray-800 shadow-2xl transform transition-transform duration-300 z-50 overflow-y-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Menu</h2>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">SUMMARY LEVEL</h3>
            {[
              { value: 'brief', label: 'Brief', icon: Zap, color: 'from-green-400 to-emerald-500' },
              { value: 'medium', label: 'Medium', icon: Clock, color: 'from-blue-400 to-cyan-500' },
              { value: 'detailed', label: 'Detailed', icon: FileText, color: 'from-purple-400 to-pink-500' }
            ].map(({ value, label, icon: Icon, color }) => (
              <button
                key={value}
                onClick={() => setSummaryLevel(value)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl mb-2 transition-all ${
                  summaryLevel === value ? `bg-gradient-to-r ${color} text-white shadow-lg` : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>

          {history.filter(h => h.isFavorite).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> FAVORITES
              </h3>
              {history.filter(h => h.isFavorite).map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setUrl(item.url)}
                  className="w-full text-left p-3 mb-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 rounded-lg"
                >
                  <p className="text-sm font-medium truncate">{item.title}</p>
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <History className="w-4 h-4" /> RECENT ({history.length})
              </h3>
              {history.length > 0 && (
                <button onClick={clearHistory} className="text-xs text-red-600 hover:underline flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No history</p>
            ) : (
              history.map((item, idx) => (
                <div key={idx} className="relative group mb-2">
                  <button
                    onClick={() => setUrl(item.url)}
                    className="w-full text-left p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-purple-100"
                  >
                    <p className="text-sm font-medium truncate pr-12">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(item.timestamp).toLocaleDateString()}</p>
                  </button>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(idx); }}
                      className={`p-1 rounded ${item.isFavorite ? 'bg-yellow-500' : 'bg-gray-500'} text-white`}
                    >
                      <Star className={`w-3 h-3 ${item.isFavorite ? 'fill-white' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); clearHistoryItem(idx); }}
                      className="p-1 bg-red-500 text-white rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {sidebarOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setSidebarOpen(false)} />}

      {/* Menu Button - Top Left */}
      <div className="fixed top-8 left-8 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-2xl hover:scale-110 animate-bounce"
          style={{animationDuration: '3s'}}
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mode Switcher - Top Right */}
      <div className="fixed top-8 right-8 z-40">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full shadow-2xl hover:scale-110 animate-bounce"
          style={{animationDuration: '3s', animationDelay: '0.3s'}}
        >
          {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2 flex items-center justify-center gap-3">
            <Sparkles className="w-10 h-10 text-purple-600 animate-pulse" />
            <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
              YouTube Summarizer
            </span>
            <Sparkles className="w-10 h-10 text-pink-600 animate-pulse" />
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">Powered by Gemini AI</p>
        </div>

        {loading && loadingProgress && (
          <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-xl mb-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <p className="text-blue-800 dark:text-blue-200 font-medium">{loadingProgress}</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Video className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube URL..."
                className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg"
                onKeyPress={(e) => e.key === 'Enter' && handleSummarize()}
              />
            </div>
            <button
              onClick={handleSummarize}
              disabled={loading || !url}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold shadow-lg hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Summarize
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900 border-l-4 border-red-500 rounded-lg">
              <p className="text-red-700 dark:text-red-200">{error}</p>
            </div>
          )}
        </div>

        {videoId && videoInfo && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 mb-8">
            <div className="mb-4">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{videoInfo.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Users className="w-4 h-4" /> {videoInfo.author}
              </p>
            </div>
            <div className="aspect-video rounded-xl overflow-hidden shadow-lg">
              <iframe 
                width="100%" 
                height="100%" 
                src={`https://www.youtube.com/embed/${videoId}`} 
                title="YouTube video" 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen 
              />
            </div>
          </div>
        )}

        {summary && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 mb-6">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">AI Summary</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Reading time: ~{readingTime} min</p>
                  </div>
                </div>
                <span className="px-4 py-2 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 text-purple-700 dark:text-purple-300 rounded-full text-sm font-semibold capitalize">
                  {summaryLevel}
                </span>
              </div>
              
              <div className="prose dark:prose-invert max-w-none mb-6">
                <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
                  {summary}
                </p>
              </div>
              
              <div className="flex flex-wrap gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button 
                  onClick={copyToClipboard} 
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transform hover:scale-105 transition-all ${
                    copied ? 'bg-green-100 dark:bg-green-900 text-green-700' : 'bg-blue-100 dark:bg-blue-900 text-blue-700'
                  }`}
                >
                  {copied ? <><CheckCircle className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy</>}
                </button>
                <button 
                  onClick={isReading ? stopReading : startReading} 
                  className="flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:scale-105 transition-all"
                >
                  {isReading ? <><VolumeX className="w-4 h-4" /> Stop</> : <><Volume2 className="w-4 h-4" /> Read Aloud</>}
                </button>
              </div>
            </div>

            {showSuccess && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900 dark:to-emerald-900 rounded-2xl p-8 text-center shadow-xl">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Summary Generated! 🎉</h3>
                <p className="text-gray-700 dark:text-gray-300">Your {summaryLevel} summary is ready!</p>
              </div>
            )}
          </>
        )}

        {!videoId && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 text-center">
            <Video className="w-16 h-16 text-purple-600 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Ready to Summarize</h3>
            <p className="text-gray-600 dark:text-gray-400 text-lg">Paste any YouTube URL above!</p>
          </div>
        )}
      </div>
    </div>
  );
}