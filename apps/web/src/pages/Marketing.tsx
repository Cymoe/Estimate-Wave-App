import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Building2, Heart } from 'lucide-react';
import { SimpleCanvas } from './experience/SimpleCanvas';
import { APP_NAME } from '@/config/brand';

// Portfolio data
const portfolioItems = [
  {
    id: 1,
    contractor: "Master Builders Co.",
    projectType: "Kitchen Remodel",
    image: "/images/kitchen.png",
    likes: "2,341",
    description: "Complete kitchen renovation with modern appliances and custom cabinetry",
    timeAgo: "2 hours ago",
    tags: ["#KitchenRemodel", "#ModernDesign"]
  },
  {
    id: 2,
    contractor: "Coastal Contractors",
    projectType: "Beachfront Villa",
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
  }
];

const Marketing = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const navigate = useNavigate();
  const [showPortfolio, setShowPortfolio] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const progress = scrollHeight > 0 ? Math.min(scrolled / scrollHeight, 1) : 0;
      
      setScrollProgress(progress);
      setShowPortfolio(progress > 0.85);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Add CSS for auto-scrolling portfolio
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
      
      @keyframes portfolioScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(calc(-400px * ${portfolioItems.length})); }
      }
      
      .auto-scroll-container {
        display: flex;
        animation: portfolioScroll 35s linear infinite;
      }
      
      .portfolio-scroll-container:hover .auto-scroll-container {
        animation-play-state: paused;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="relative bg-gray-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 bg-gray-900/80 backdrop-blur-sm">
        <div className="text-2xl font-bold text-white">{APP_NAME}</div>
        <div className="flex items-center gap-6">
          <Link to="/" className="text-white hover:text-blue-400 transition-colors">Home</Link>
          <Link to="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors">
            Sign In
          </Link>
        </div>
      </nav>
      
      {/* Canvas Section */}
      <div className="relative h-screen">
        <SimpleCanvas scrollProgress={scrollProgress} />
        
        {/* Initial CTA */}
        {scrollProgress < 0.1 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center mt-32">
              <p className="text-xl text-gray-300 mb-8">Scroll to transform chaos into clarity</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-8 py-4 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg rounded-lg transition-colors"
              >
                Start Free Trial
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Spacer for scroll */}
      <div style={{ height: '300vh' }} />
      
      {/* Portfolio Section */}
      {showPortfolio && (
        <div className="bg-gray-50 py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Real Projects, Real Results
              </h2>
              <p className="text-xl text-gray-600">
                See how contractors are showcasing their best work
              </p>
            </div>
          </div>
          
          {/* Portfolio Carousel */}
          <div className="overflow-hidden">
            <div className="portfolio-scroll-container">
              <div className="auto-scroll-container flex gap-4 px-4">
                {/* First set */}
                {portfolioItems.map((item) => (
                  <div
                    key={item.id}
                    className="w-96 bg-white rounded-lg shadow-lg overflow-hidden flex-shrink-0"
                  >
                    <div className="p-4 border-b">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{item.contractor}</h3>
                          <p className="text-sm text-gray-500">{item.projectType}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="aspect-square bg-gray-200">
                      <img 
                        src={item.image} 
                        alt={item.projectType}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="p-4">
                      <p className="text-gray-600 mb-4">{item.description}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">{item.timeAgo}</span>
                        <div className="flex items-center gap-2">
                          <Heart className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-500">{item.likes}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Duplicate set for seamless loop */}
                {portfolioItems.map((item) => (
                  <div
                    key={`dup-${item.id}`}
                    className="w-96 bg-white rounded-lg shadow-lg overflow-hidden flex-shrink-0"
                  >
                    <div className="p-4 border-b">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{item.contractor}</h3>
                          <p className="text-sm text-gray-500">{item.projectType}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="aspect-square bg-gray-200">
                      <img 
                        src={item.image} 
                        alt={item.projectType}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="p-4">
                      <p className="text-gray-600 mb-4">{item.description}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">{item.timeAgo}</span>
                        <div className="flex items-center gap-2">
                          <Heart className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-500">{item.likes}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Final CTA */}
          <div className="text-center mt-16">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg rounded-lg transition-colors"
            >
              Start Your Journey
              <ArrowRight className="inline-block ml-3 h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketing; 