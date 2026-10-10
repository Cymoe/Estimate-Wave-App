import { useNavigate } from "react-router-dom";
import { MarketingHeader } from "./marketing/MarketingHeader";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  LineChart,
  Settings,
  Users,
  Heart
} from "lucide-react";
import { APP_NAME, SUPPORT_EMAIL } from '@/config/brand';
// AuthButtons now imported directly in MarketingHeader

export const LandingPage = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const portfolioContainerRef = useRef<HTMLDivElement>(null);
  // State for tracking the active slide (used by the auto-scroll functionality)
  const [, setActiveSlide] = useState(0);
  const [isPaused] = useState(false); // Used in the hero section auto-scroll
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Drag functionality state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const dragContainerRef = useRef<HTMLDivElement>(null);
  
  // Portfolio showcase data - moved up before the useEffect that references it
  const portfolioItems = [
    {
      id: 1,
      contractor: "Elite Construction Co.",
      projectType: "Kitchen Remodel",
      image: "/images/kitchen.png",
      likes: "2,845",
      description: "Complete kitchen transformation with custom cabinetry and quartz countertops",
      timeAgo: "6 hours ago",
      tags: ["#KitchenRemodel", "#CustomCabinets"]
    },
    {
      id: 2,
      contractor: "Modern Builders LLC",
      projectType: "Luxury Home",
      image: "/images/jungle-apartments.png", 
      likes: "4,231",
      description: "Luxury modern home with infinity pool and panoramic ocean views",
      timeAgo: "8 hours ago",
      tags: ["#LuxuryHome", "#ModernArchitecture"]
    },
    {
      id: 3,
      contractor: "Renovation Experts",
      projectType: "Bathroom Remodel",
      image: "/images/condo.png",
      likes: "3,927",
      description: "Master bathroom renovation with walk-in shower and dual vanities",
      timeAgo: "12 hours ago",
      tags: ["#BathroomRemodel", "#MasterBath"]
    },
    {
      id: 4,
      contractor: "Property Flip Pros",
      projectType: "New Construction",
      image: "/images/mutli.png",
      likes: "5,164",
      description: "Complete property development with modern family homes",
      timeAgo: "1 day ago",
      tags: ["#NewConstruction", "#Development"]
    },
    {
      id: 5,
      contractor: "Precision Homes",
      projectType: "New Home",
      image: "/images/new.png",
      likes: "6,732",
      description: "New construction with perfect landscaping and modern design",
      timeAgo: "2 days ago",
      tags: ["#NewHome", "#Landscaping"]
    },
    {
      id: 6,
      contractor: "Urban Renovators",
      projectType: "Loft Conversion",
      image: "/images/loft.png",
      likes: "3,451",
      description: "Industrial warehouse converted to modern loft apartments",
      timeAgo: "3 days ago",
      tags: ["#LoftConversion", "#Industrial"]
    },
    {
      id: 7,
      contractor: "Outdoor Living Experts",
      projectType: "Deck & Patio",
      image: "/images/deck.png",
      likes: "4,127",
      description: "Multi-level composite deck with built-in fire pit and outdoor kitchen",
      timeAgo: "4 days ago",
      tags: ["#OutdoorLiving", "#DeckDesign"]
    },
    {
      id: 8,
      contractor: "Heritage Restoration",
      projectType: "Historic Renovation",
      image: "/images/historical.png",
      likes: "5,893",
      description: "Careful restoration of 1890s Victorian with modern conveniences",
      timeAgo: "5 days ago",
      tags: ["#HistoricRenovation", "#Victorian"]
    },
    {
      id: 9,
      contractor: "Urban Development Group",
      projectType: "Luxury Condominium",
      image: "/images/bath.png",
      likes: "7,214",
      description: "Modern luxury condominium with premium finishes and city views",
      timeAgo: "1 week ago",
      tags: ["#LuxuryLiving", "#UrbanDevelopment"]
    }
  ];
  
  // Canvas animation state
  const heroCanvasRef = useRef<HTMLCanvasElement>(null);
  const heroParticles = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
  }>>([]);
  
  // Add CSS to hide scrollbar and add auto-scrolling animation
  useEffect(() => {
    // Create style element
    const style = document.createElement('style');
    // Add CSS rules for scrollbar hiding and auto-scroll animation
    style.textContent = `
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
      
      @keyframes portfolioScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(calc(-336px * ${portfolioItems.length})); } /* Adjust based on card width + margin for mobile */
      }
      
      @media (min-width: 640px) {
        @keyframes portfolioScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-352px * ${portfolioItems.length})); } /* Adjust for small screens */
        }
      }
      
      @media (min-width: 768px) {
        @keyframes portfolioScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-384px * ${portfolioItems.length})); } /* Adjust for medium screens */
        }
      }
      
      .auto-scroll-container {
        display: flex !important;
        width: fit-content !important;
        animation: portfolioScroll 45s linear infinite;
        will-change: transform;
      }
      
      /* Pause animation on hover - pure CSS solution */
      .portfolio-scroll-container:hover .auto-scroll-container {
        animation-play-state: paused !important;
      }
      
      /* Resume animation when not hovering */
      .auto-scroll-container {
        animation-play-state: running;
      }
      
      /* Pause animation when dragging */
      .auto-scroll-container.dragging {
        animation-play-state: paused !important;
      }
      
      /* Cursor styles for draggable area */
      .portfolio-scroll-container {
        cursor: grab;
      }
      
      .portfolio-scroll-container.dragging {
        cursor: grabbing;
        user-select: none;
      }
    `;
    // Append style to head
    document.head.appendChild(style);
    
    // Clean up
    return () => {
      document.head.removeChild(style);
    };
  }, [portfolioItems.length]);
  
  // Apply marketing-page class to body for light theme
  useEffect(() => {
    // Add marketing-page class to body
    document.body.classList.add('marketing-page');
    
    // Clean up function to remove class when component unmounts
    return () => {
      document.body.classList.remove('marketing-page');
    };
  }, []);
  
  // We're using pure CSS for the pause-on-hover functionality, no JavaScript event listeners needed
  
  // Drag functionality handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!dragContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - dragContainerRef.current.offsetLeft);
    setScrollLeft(dragContainerRef.current.scrollLeft);
    
    // Add dragging class to pause animation
    dragContainerRef.current.classList.add('dragging');
    const autoScrollContainer = dragContainerRef.current.querySelector('.auto-scroll-container');
    if (autoScrollContainer) {
      autoScrollContainer.classList.add('dragging');
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - dragContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Multiply by 2 for faster scrolling
    dragContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    
    // Remove dragging class to resume animation
    if (dragContainerRef.current) {
      dragContainerRef.current.classList.remove('dragging');
      const autoScrollContainer = dragContainerRef.current.querySelector('.auto-scroll-container');
      if (autoScrollContainer) {
        autoScrollContainer.classList.remove('dragging');
      }
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    
    // Remove dragging class to resume animation
    if (dragContainerRef.current) {
      dragContainerRef.current.classList.remove('dragging');
      const autoScrollContainer = dragContainerRef.current.querySelector('.auto-scroll-container');
      if (autoScrollContainer) {
        autoScrollContainer.classList.remove('dragging');
      }
    }
  };

  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!dragContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.touches[0].pageX - dragContainerRef.current.offsetLeft);
    setScrollLeft(dragContainerRef.current.scrollLeft);
    
    // Add dragging class to pause animation
    dragContainerRef.current.classList.add('dragging');
    const autoScrollContainer = dragContainerRef.current.querySelector('.auto-scroll-container');
    if (autoScrollContainer) {
      autoScrollContainer.classList.add('dragging');
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !dragContainerRef.current) return;
    const x = e.touches[0].pageX - dragContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    dragContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    
    // Remove dragging class to resume animation
    if (dragContainerRef.current) {
      dragContainerRef.current.classList.remove('dragging');
      const autoScrollContainer = dragContainerRef.current.querySelector('.auto-scroll-container');
      if (autoScrollContainer) {
        autoScrollContainer.classList.remove('dragging');
      }
    }
  };
  
  // Image styling is now applied directly in the JSX

  // Auto-scroll functionality for hero section
  useEffect(() => {
    const startAutoScroll = () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
      
      autoScrollIntervalRef.current = setInterval(() => {
        if (scrollContainerRef.current && !isPaused) {
          const container = scrollContainerRef.current;
          const maxScroll = container.scrollWidth - container.clientWidth;
          
          // If we're at the end, go back to the beginning
          if (container.scrollLeft >= maxScroll - 20) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
            setActiveSlide(0);
          } else {
            // Otherwise, move to the next slide
            const slideWidth = container.clientWidth;
            const currentSlide = Math.round(container.scrollLeft / slideWidth);
            const nextSlide = currentSlide + 1;
            
            container.scrollTo({ 
              left: nextSlide * slideWidth, 
              behavior: 'smooth' 
            });
            
            setActiveSlide(nextSlide);
          }
        }
      }, 5000); // Change slide every 5 seconds
    };
    
    startAutoScroll();
    
    // Clean up interval on component unmount
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, [isPaused]);
  
  // We're now using CSS animation for auto-scrolling instead of JavaScript
  // This is more efficient and starts automatically when the component renders
  
  // Add scroll event listener to update active slide indicator
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const scrollPosition = scrollContainerRef.current.scrollLeft;
        const slideWidth = scrollContainerRef.current.clientWidth;
        const newActiveSlide = Math.round(scrollPosition / slideWidth);
        setActiveSlide(newActiveSlide);
      }
    };
    
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // Portfolio showcase data was moved to the top of the component

  useEffect(() => {
    if (user && !isLoading) {
      console.log('User already authenticated, redirecting to dashboard');
      navigate("/dashboard", { replace: true });
    }
  }, [user, isLoading, navigate]);

  // Initialize hero canvas animation
  useEffect(() => {
    const canvas = heroCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = 600; // Fixed height for hero section
    };
    resizeCanvas();

    // Initialize particles
    heroParticles.current = [];
    for (let i = 0; i < 30; i++) {
      heroParticles.current.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.3 + 0.1
      });
    }

    let animationId: number;
    const animate = () => {
      // Clear canvas with fade effect
      ctx.fillStyle = 'rgba(249, 250, 251, 0.1)'; // Light background with transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      heroParticles.current.forEach(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        // Wrap around
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;
        
        // Draw particle
        ctx.fillStyle = `rgba(51, 102, 153, ${particle.opacity})`; // Brand blue color
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Connect nearby particles
      heroParticles.current.forEach((p1, i) => {
        heroParticles.current.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 100) {
            ctx.strokeStyle = `rgba(51, 102, 153, ${0.1 * (1 - distance / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Marketing Header */}
      <MarketingHeader useAuthButtons={true} showSignIn={false} />

      {/* Hero Section */}
      <main className="relative">
        {/* Animated Canvas Background */}
        <canvas 
          ref={heroCanvasRef}
          className="absolute inset-0 w-full"
          style={{ height: '600px', opacity: 0.3 }}
        />
        
        <div className="container mx-auto px-4 py-12 md:py-24 relative z-10">
          <div className="text-center space-y-8">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 max-w-4xl mx-auto">
              Streamline Your Business & Showcase Your Work
            </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {APP_NAME} empowers master craftsmen, trade professionals, and real estate investors to manage their business 
            with professional invoicing while tracking costs and showcasing their best projects.
            <a href="/who-we-serve" className="text-blue-600 hover:underline ml-1">
              See who we serve →
            </a>
          </p>
          <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center justify-center px-6 py-3 text-white rounded-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#336699', borderRadius: '4px' }}
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
            <button
              onClick={() => navigate('/marketing/projects')}
              className="flex items-center justify-center px-6 py-3 border rounded-lg hover:bg-opacity-10 transition-colors"
              style={{ borderColor: '#336699', color: '#336699', borderRadius: '4px', backgroundColor: 'transparent' }}
            >
              See More Projects
            </button>
          </div>
        </div>
      </div>

        {/* Portfolio Showcase Section - Full Width */}
        <div className="mt-12 sm:mt-16" style={{ position: 'relative', width: '100vw', left: '50%', right: '50%', marginLeft: '-50vw', marginRight: '-50vw', overflow: 'hidden' }}>

          {/* Portfolio Horizontal Scroll */}
          <div className="w-full relative">
            {/* Left fade/blur effect - very minimal for mobile */}
            <div className="absolute left-0 top-0 bottom-0 w-8 md:w-32 z-10 pointer-events-none" 
              style={{ 
                background: 'linear-gradient(to right, rgba(249, 250, 251, 0.9) 0%, rgba(249, 250, 251, 0.6) 40%, rgba(249, 250, 251, 0.3) 70%, rgba(249, 250, 251, 0) 100%)',
                backdropFilter: 'blur(1px)',
                WebkitBackdropFilter: 'blur(1px)'
              }}>
            </div>
            
            {/* Right fade/blur effect - very minimal for mobile */}
            <div className="absolute right-0 top-0 bottom-0 w-8 md:w-32 z-10 pointer-events-none" 
              style={{ 
                background: 'linear-gradient(to left, rgba(249, 250, 251, 0.9) 0%, rgba(249, 250, 251, 0.6) 40%, rgba(249, 250, 251, 0.3) 70%, rgba(249, 250, 251, 0) 100%)',
                backdropFilter: 'blur(1px)',
                WebkitBackdropFilter: 'blur(1px)'
              }}>
            </div>
            
            {/* Portfolio section - auto-scrolling carousel with CSS animation and drag support */}
            <div 
              ref={dragContainerRef}
              className="overflow-x-auto pb-6 no-scrollbar portfolio-scroll-container"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                whiteSpace: 'nowrap', /* This is for the horizontal layout of cards */
                paddingLeft: '0.5rem',
                paddingRight: '4rem',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                position: 'relative',
                overflow: 'hidden', /* Hide overflow but allow scrolling */
              }}>
              {/* Auto-scrolling container with duplicated items for seamless looping */}
              <div 
                className="auto-scroll-container"
                style={{ 
                  display: 'flex', 
                  width: 'fit-content',
                  animation: 'portfolioScroll 45s linear infinite',
                  willChange: 'transform'
                }}>
                {/* First set of items */}
                {portfolioItems.map((item) => (
                <div
                  key={item.id}
                  className="inline-block align-top w-72 sm:w-80 md:w-96 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200"
                  style={{ marginRight: '1rem', whiteSpace: 'normal' }}>
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center" style={{ backgroundColor: '#336699' }}>
                        <Building2 className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm">{item.contractor}</h3>
                        <p className="text-xs text-gray-500">{item.projectType}</p>
                      </div>
                    </div>
                    {/* Card header - no menu button */}
                  </div>

                  {/* Image */}
                  <div className="aspect-square bg-gray-200 relative overflow-hidden">
                    {item.image && item.image.includes('.png') ? (
                      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${item.image}')` }}>
                        <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs" style={{ borderRadius: '4px' }}>
                          {item.projectType}
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #5588bb, #336699)' }}>
                        <Building2 className="h-16 w-16 text-white opacity-50" />
                        <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs" style={{ borderRadius: '4px' }}>
                          {item.projectType}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-2 truncate">{item.contractor}</h3>
                    <p className="text-gray-600 mb-4 text-sm line-clamp-2">{item.description}</p>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500 truncate max-w-[100px]">{item.contractor}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Heart className="h-4 w-4 text-gray-400" />
                        <span className="text-xs text-gray-500">{item.likes}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
                
                {/* Duplicate items to create seamless infinite scroll effect */}
                {portfolioItems.map((item) => (
                  <div
                    key={`duplicate-${item.id}`}
                    className="inline-block align-top w-72 sm:w-80 md:w-96 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200"
                    style={{ marginRight: '1rem', whiteSpace: 'normal' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center" style={{ backgroundColor: '#336699' }}>
                          <Building2 className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm">{item.contractor}</h3>
                          <p className="text-xs text-gray-500">{item.projectType}</p>
                        </div>
                      </div>
                      {/* Card header - no menu button */}
                    </div>

                    {/* Image */}
                    <div className="aspect-square bg-gray-200 relative overflow-hidden">
                      {item.image && item.image.includes('.png') ? (
                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${item.image}')` }}>
                          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs" style={{ borderRadius: '4px' }}>
                            {item.projectType}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #5588bb, #336699)' }}>
                          <Building2 className="h-16 w-16 text-white opacity-50" />
                          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs" style={{ borderRadius: '4px' }}>
                            {item.projectType}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-lg mb-2 truncate">{item.contractor}</h3>
                      <p className="text-gray-600 mb-4 text-sm line-clamp-2">{item.description}</p>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 truncate max-w-[100px]">{item.contractor}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Heart className="h-4 w-4 text-gray-400" />
                          <span className="text-xs text-gray-500">{item.likes}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Auto-scrolling carousel with no navigation arrows */}
            
            {/* No pagination indicators - clean auto-scrolling carousel */}
          </div>

          {/* Portfolio section ends here */}
        </div>

        {/* Industry Insights Section */}
        <div className="container mx-auto px-4">
          <div className="mt-24 bg-white p-8 rounded-lg border border-gray-300 shadow-md">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-6 md:mb-0 md:mr-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Industry Insights</h2>
              <p className="text-gray-800 mb-4 font-medium">
                Discover what construction professionals are really asking for in their software solutions. 
                Our research reveals the key pain points and feature requests that major SaaS companies are missing.
              </p>
              <a 
                href="/docs/construction-saas-user-feedback" 
                className="inline-flex items-center px-4 py-2 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors font-medium"
              >
                Read the Research
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </div>
            <div className="bg-white p-5 rounded-lg border border-gray-300 shadow-sm max-w-md">
              <h3 className="font-bold text-gray-900 mb-3 text-lg">Top User Requests:</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800 font-medium">Seamless field-to-office communication</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800 font-medium">Simplified user experience for smaller contractors</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800 font-medium">Better integration between operational systems</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        </div>
        
        {/* Features Grid */}
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 mt-24">
            <FeatureCard
              icon={<FileText className="h-8 w-8" style={{ color: '#336699' }} />}
              title="Invoice Generation"
              description="Create and customize professional invoices in seconds"
            />
            <FeatureCard
              icon={<Users className="h-8 w-8" style={{ color: '#336699' }} />}
              title="Client Management"
              description="Organize and manage your client information efficiently"
            />
            <FeatureCard
              icon={<CreditCard className="h-8 w-8" style={{ color: '#336699' }} />}
              title="Payment Tracking"
              description="Track payments and manage your cash flow effectively"
            />
            <FeatureCard
              icon={<Building2 className="h-8 w-8" style={{ color: '#336699' }} />}
              title="Business Analytics"
              description="Gain insights into your business performance"
            />
            <FeatureCard
              icon={<Settings className="h-8 w-8" style={{ color: '#336699' }} />}
              title="Customization"
              description="Tailor the system to match your business needs"
            />
            <FeatureCard
              icon={<LineChart className="h-8 w-8" style={{ color: '#336699' }} />}
              title="Financial Reports"
              description="Generate detailed reports for better decision making"
            />
          </div>

          {/* Benefits Section */}
          <div className="mt-24 bg-white p-4 sm:p-8 rounded-lg border border-gray-300 shadow-md">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-8 sm:mb-12">Why Choose {APP_NAME}?</h2>
            <div className="space-y-8">
              <BenefitRow
                icon={<CheckCircle2 className="h-6 w-6" style={{ color: '#336699' }} />}
                title="Save Time"
                description="Automate your billing process and focus on growing your business"
              />
              <BenefitRow
                icon={<CheckCircle2 className="h-6 w-6" style={{ color: '#336699' }} />}
                title="Professional Image"
                description="Create polished, branded invoices that impress your clients"
              />
              <BenefitRow
                icon={<CheckCircle2 className="h-6 w-6" style={{ color: '#336699' }} />}
                title="Stay Organized"
                description="Keep all your billing and client information in one place"
              />
            </div>
          </div>
        </div>

        {/* Interactive Experience Preview Section */}
        <div className="mt-24 text-center">
          <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl p-12 relative overflow-hidden">
            {/* Animated background effect */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-1/4 w-64 h-64 bg-blue-500 rounded-full filter blur-3xl animate-pulse"></div>
              <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-500 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
            
            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Experience the Future of Construction Tech
              </h2>
              <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
                Take an interactive journey through how {APP_NAME} transforms chaos into clarity with AI-powered automation and beautiful visualizations.
              </p>
              <button
                onClick={() => navigate('/experience')}
                className="inline-flex items-center px-8 py-4 text-lg font-semibold text-black bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 hover:shadow-xl"
              >
                Launch Interactive Experience
                <ArrowRight className="ml-3 h-5 w-5" />
              </button>
              
              <div className="mt-8 flex items-center justify-center space-x-4 text-sm text-gray-400">
                <span>🎨 Stunning Visuals</span>
                <span>•</span>
                <span>🚀 Scroll-Driven Animation</span>
                <span>•</span>
                <span>✨ AI-Powered Insights</span>
              </div>
            </div>
          </div>
        </div>

        {/* Blog CTA Section */}
        <div className="mt-16 sm:mt-24 text-center bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 sm:p-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Industry Insights & Guides
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Explore our blog for expert tips on pricing, project management, and growing your construction business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/blog"
              className="inline-flex items-center justify-center px-6 py-3 text-lg font-semibold text-white rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105"
              style={{ backgroundColor: '#336699' }}
            >
              Visit Our Blog
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
            <button
              onClick={() => navigate('/profit-tracker')}
              className="inline-flex items-center justify-center px-6 py-3 text-lg font-semibold text-gray-900 bg-white rounded-lg shadow-lg border border-gray-300 transition-all duration-200 transform hover:scale-105"
            >
              Start Free Trial
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 mt-16 sm:mt-24 py-8 sm:py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8 text-center md:text-left">
            <div>
              <h3 className="text-lg font-bold mb-4">{APP_NAME}</h3>
              <p className="text-gray-600">The all-in-one business management platform for contractors and service providers.</p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Quick Links</h3>
              <ul className="space-y-2">
                <li><button onClick={() => navigate('/projects')} className="text-gray-600 hover:text-gray-900">Projects</button></li>
                <li><button onClick={() => navigate('/insights')} className="text-gray-600 hover:text-gray-900">Insights</button></li>
                <li><button onClick={() => navigate('/roadmap')} className="text-gray-600 hover:text-gray-900">Roadmap</button></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Contact</h3>
              <p className="text-gray-600">Have questions? Reach out to our support team.</p>
              <p className="text-gray-600 mt-2">{SUPPORT_EMAIL}</p>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8 text-center text-gray-600">
            <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-300 hover:shadow-md transition-shadow">
    <div className="mb-4">{icon}</div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-800">{description}</p>
  </div>
);

const BenefitRow = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left">
    <div className="mb-4 sm:mb-0 sm:mr-6 flex-shrink-0">{icon}</div>
    <div>
      <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
      <p className="text-gray-800">{description}</p>
    </div>
  </div>
); 