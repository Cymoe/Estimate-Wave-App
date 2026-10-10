import { useState, useEffect } from 'react';
import PropertyTypeCard from '../../components/marketing/PropertyTypeCard';
import { MarketingHeader } from '../../components/marketing/MarketingHeader';
import { 
  Building2, 
  Search,
  ArrowRight
} from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { APP_NAME } from '@/config/brand';

// Project type definition
interface Project {
  id: number;
  contractor: string;
  projectType: string;
  image: string;
  likes: string;
  description: string;
  timeAgo: string;
  tags: string[];
  featured?: boolean;
  cost?: string; // Total project cost
  rating?: number; // Contractor rating (out of 5)
  location?: string; // Project location (city, state)
}

// Main Projects component for the marketing page
export const Projects = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Apply marketing-page class to body for light theme
  useEffect(() => {
    // Add marketing-page class to body
    document.body.classList.add('marketing-page');
    
    // Clean up function to remove class when component unmounts
    return () => {
      document.body.classList.remove('marketing-page');
    };
  }, []);
  
  // Sample projects data - in a real app, this would come from an API or database
  const projects: Project[] = [
    {
      id: 1,
      contractor: "Elite Construction Co.",
      projectType: "Kitchen Remodel",
      image: "/images/kitchen.png",
      likes: "2,845",
      description: "Complete kitchen transformation with custom cabinetry and quartz countertops",
      timeAgo: "6 hours ago",
      tags: ["#KitchenRemodel", "#CustomCabinets"],
      featured: true,
      cost: "42,500",
      rating: 4.7,
      location: "Denver, CO"
    },
    {
      id: 2,
      contractor: "Modern Builders LLC",
      projectType: "Luxury Home",
      image: "/images/bali-villa.png", 
      likes: "4,231",
      description: "Luxury modern home with infinity pool and panoramic ocean views",
      timeAgo: "8 hours ago",
      tags: ["#LuxuryHome", "#ModernArchitecture"],
      featured: true,
      cost: "1,250,000",
      rating: 4.9,
      location: "Miami, FL"
    },
    {
      id: 3,
      contractor: "Renovation Experts",
      projectType: "Bathroom Remodel",
      image: "/images/bath.png",
      likes: "3,927",
      description: "Master bathroom renovation with walk-in shower and dual vanities",
      timeAgo: "12 hours ago",
      tags: ["#BathroomRemodel", "#MasterBath"],
      featured: true,
      cost: "28,750",
      rating: 4.6,
      location: "Seattle, WA"
    },
    {
      id: 4,
      contractor: "Property Flip Pros",
      projectType: "New Construction",
      image: "/images/new.png",
      likes: "5,164",
      description: "Complete property development with modern family homes",
      timeAgo: "1 day ago",
      tags: ["#NewConstruction", "#Development"],
      featured: true,
      cost: "875,000",
      rating: 4.8,
      location: "Portland, OR"
    },
    {
      id: 5,
      contractor: "Precision Homes",
      projectType: "New Home",
      image: "/images/mutli.png",
      likes: "6,732",
      description: "New construction with perfect landscaping and modern design",
      timeAgo: "2 days ago",
      tags: ["#NewHome", "#Landscaping"],
      featured: true,
      cost: "685,000",
      rating: 4.9,
      location: "Austin, TX"
    },
    {
      id: 6,
      contractor: "Urban Renovators",
      projectType: "Loft Conversion",
      image: "/images/loft.png",
      likes: "3,451",
      description: "Industrial warehouse converted to modern loft apartments",
      timeAgo: "3 days ago",
      tags: ["#LoftConversion", "#Industrial"],
      featured: true,
      cost: "325,000",
      rating: 4.8,
      location: "Brooklyn, NY"
    },
    {
      id: 7,
      contractor: "Outdoor Living Experts",
      projectType: "Deck & Patio",
      image: "/images/deck.png",
      likes: "4,127",
      description: "Multi-level composite deck with built-in fire pit and outdoor kitchen",
      timeAgo: "4 days ago",
      tags: ["#OutdoorLiving", "#DeckDesign"],
      featured: true,
      cost: "78,500",
      rating: 4.7,
      location: "San Diego, CA"
    },
    {
      id: 8,
      contractor: "Heritage Restoration",
      projectType: "Historic Renovation",
      image: "/images/historical.png",
      likes: "5,893",
      description: "Careful restoration of 1890s Victorian with modern conveniences",
      timeAgo: "5 days ago",
      tags: ["#HistoricRenovation", "#Victorian"],
      featured: true,
      cost: "425,000",
      rating: 4.9,
      location: "Boston, MA"
    },
    {
      id: 9,
      contractor: "Urban Development Group",
      projectType: "Luxury Condominium",
      image: "/images/condo.png",
      likes: "7,214",
      description: "Modern luxury condominium with premium finishes and city views",
      timeAgo: "1 week ago",
      tags: ["#LuxuryLiving", "#UrbanDevelopment"],
      featured: true,
      cost: "1,850,000",
      rating: 4.8,
      location: "Chicago, IL"
    },
    {
      id: 10,
      contractor: "Green Building Solutions",
      projectType: "Eco-Friendly Home",
      image: "/images/jungle-apartments.png",
      likes: "6,892",
      description: "Net-zero energy home with solar panels and sustainable materials",
      timeAgo: "1 week ago",
      tags: ["#EcoFriendly", "#Sustainable"],
      cost: "725,000",
      rating: 4.7,
      location: "Denver, CO"
    },
    {
      id: 11,
      contractor: "Commercial Builders Inc.",
      projectType: "Office Renovation",
      image: "/images/cabinets.png",
      likes: "3,892",
      description: "Complete office space renovation with modern workspace design",
      timeAgo: "2 weeks ago",
      tags: ["#OfficeRenovation", "#WorkspaceDesign"],
      cost: "350,000",
      rating: 4.6,
      location: "Atlanta, GA"
    },
    {
      id: 12,
      contractor: "Basement Specialists",
      projectType: "Basement Finishing",
      image: "/images/new.png",
      likes: "2,756",
      description: "Unfinished basement transformed into entertainment space with wet bar",
      timeAgo: "2 weeks ago",
      tags: ["#BasementFinishing", "#Entertainment"],
      cost: "65,000",
      rating: 4.7,
      location: "Minneapolis, MN"
    },
    {
      id: 13,
      contractor: "Roofing Excellence",
      projectType: "Roof Replacement",
      image: "/images/kitchen.png",
      likes: "1,983",
      description: "Complete roof replacement with architectural shingles and improved ventilation",
      timeAgo: "3 weeks ago",
      tags: ["#RoofReplacement", "#HomeImprovement"],
      cost: "32,500",
      rating: 4.8,
      location: "Phoenix, AZ"
    },
    {
      id: 14,
      contractor: "Luxury Kitchen Designs",
      projectType: "Kitchen Remodel",
      image: "/images/modern-kitchen.jpg",
      likes: "3,512",
      description: "Photorealistic modern kitchen with sleek white cabinets, marble countertops, large island with pendant lighting",
      timeAgo: "2 hours ago",
      tags: ["#ModernKitchen", "#MinimalistDesign"],
      featured: true,
      cost: "58,900",
      rating: 4.9,
      location: "San Francisco, CA"
    }
  ];

  // Filter projects based on selected filter and search term
  const filteredProjects = projects.filter(project => {
    // Filter by category
    if (filter !== 'all' && filter !== 'featured') {
      if (!project.projectType.toLowerCase().includes(filter.toLowerCase())) {
        return false;
      }
    }
    
    // Filter featured projects
    if (filter === 'featured' && !project.featured) {
      return false;
    }
    
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        project.contractor.toLowerCase().includes(searchLower) ||
        project.projectType.toLowerCase().includes(searchLower) ||
        project.description.toLowerCase().includes(searchLower) ||
        project.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    return true;
  });

  // Note: Projects without images will show gradient background

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Marketing Header */}
      <MarketingHeader />

      {/* Header */}
      <header className="container mx-auto px-4 py-12">
        <div className="text-center space-y-4 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
            Construction Project Showcase
          </h1>
          <p className="text-xl text-gray-600">
            Browse through our collection of exceptional construction projects created by {APP_NAME} users.
            From kitchen remodels to luxury homes, find inspiration for your next project.
          </p>
        </div>
      </header>

      {/* Property Type Cards */}
      <div className="container mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Browse by Property Type</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
          {/* Property Type Cards */}
          {/* Calculate counts for each property type */}
          {(() => {
            const typeCounts = projects.reduce((acc, project) => {
              const type = project.projectType.toLowerCase();
              acc[type] = (acc[type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            
            // Define property types with their details
            const propertyTypes = [
              { id: 'all', title: 'All Projects', count: projects.length, image: '/images/bali-villa.png' },
              { id: 'luxury home', title: 'Luxury Homes', count: typeCounts['luxury home'] || 0, image: '/images/bali-villa.png' },
              { id: 'new home', title: 'New Homes', count: typeCounts['new home'] || 0, image: '/images/mutli.png' },
              { id: 'kitchen remodel', title: 'Kitchen Remodels', count: typeCounts['kitchen remodel'] || 0, image: '/images/kitchen.png' },
              { id: 'bathroom remodel', title: 'Bathroom Remodels', count: typeCounts['bathroom remodel'] || 0, image: '/images/bath.png' },
              { id: 'new construction', title: 'New Construction', count: typeCounts['new construction'] || 0, image: '/images/new.png' },
              { id: 'loft conversion', title: 'Loft Conversions', count: typeCounts['loft conversion'] || 0, image: '/images/loft.png' },
              { id: 'deck & patio', title: 'Decks & Patios', count: typeCounts['deck & patio'] || 0, image: '/images/deck.png' },
              { id: 'historic renovation', title: 'Historic Renovations', count: typeCounts['historic renovation'] || 0, image: '/images/historical.png' },
              { id: 'featured', title: 'Featured Projects', count: projects.filter(p => p.featured).length, image: '/images/jungle-apartments.png' }
            ];
            
            // Return the mapped property type cards
            return propertyTypes.map(type => (
              <PropertyTypeCard
                key={type.id}
                title={type.title}
                count={type.count}
                image={type.image}
                isActive={filter === type.id}
                onClick={() => setFilter(type.id)}
              />
            ));
          })()}
        </div>
        
        {/* Search */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <div className="relative w-full md:w-1/3">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search projects..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ borderColor: '#333333', backgroundColor: '#FFFFFF' }}
            />
          </div>
          
          {searchTerm && (
            <button
              className="px-3 py-1 text-sm rounded-lg text-gray-700 hover:bg-gray-200 flex items-center"
              onClick={() => setSearchTerm('')}
              style={{ borderRadius: '4px' }}
            >
              Clear Search
            </button>
          )}
        </div>
      </div>

      {/* Projects Grid - Instagram-like layout */}
      <div className="container mx-auto pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0.5">
          {filteredProjects.length > 0 ? (
            filteredProjects.map((project) => (
              <div 
                key={project.id} 
                className="bg-white overflow-hidden flex flex-col border border-gray-100"
                style={{ width: '100%' }}
              >
                {/* Header with Contractor and Rating */}
                <div className="p-3 flex items-center justify-between bg-gray-50">
                  <div>
                    <h3 className="font-bold text-gray-900 uppercase tracking-wide text-sm">{project.contractor}</h3>
                    <div className="flex items-center mt-1 space-x-3">
                      {project.location && (
                        <span className="text-xs text-gray-600 uppercase tracking-wide">{project.location}</span>
                      )}
                      <span className="text-xs text-gray-600 uppercase tracking-wide">{project.timeAgo}</span>
                    </div>
                  </div>
                  {/* Rating removed as requested */}
                </div>

                {/* Project Image */}
                <div className="bg-gray-200 relative overflow-hidden" style={{ height: '250px' }}>
                  {project.id === 1 ? (
                    <img 
                      src="/images/kitchen.png"
                      alt="Kitchen Remodel"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 3 ? (
                    <img 
                      src="/images/bath.png"
                      alt="Bathroom Remodel"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 4 ? (
                    <img 
                      src="/images/new-const.png"
                      alt="New Construction"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 5 ? (
                    <img 
                      src="/images/new.png"
                      alt="New Home"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 6 ? (
                    <img 
                      src="/images/loft.png"
                      alt="Loft Conversion"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 7 ? (
                    <img 
                      src="/images/deckpatio.png"
                      alt="Deck & Patio"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 8 ? (
                    <img 
                      src="/images/historic.png"
                      alt="Historic Renovation"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 9 ? (
                    <img 
                      src="/images/condo.png"
                      alt="Luxury Condominium"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 10 ? (
                    <img 
                      src="/images/eco.png"
                      alt="Eco-Friendly Home"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 11 ? (
                    <img 
                      src="/images/office.png"
                      alt="Office Renovation"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 12 ? (
                    <img 
                      src="/images/basement.png"
                      alt="Basement Finishing"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 13 ? (
                    <img 
                      src="/images/roof.png"
                      alt="Roof Replacement"
                      className="w-full h-full object-cover"
                    />
                  ) : project.id === 14 ? (
                    <img 
                      src="/images/modern-kitchen.jpg"
                      alt="Modern Kitchen"
                      className="w-full h-full object-cover"
                    />
                  ) : project.image ? (
                    <img 
                      src={project.image}
                      alt={project.projectType}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div 
                      className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"
                    >
                      <Building2 className="h-16 w-16 text-gray-500 opacity-50" />
                    </div>
                  )}
                  
                  {/* Featured Badge */}
                  {project.featured && (
                    <div 
                      className="absolute top-3 right-3 px-3 py-1 text-xs font-bold uppercase tracking-wide"
                      style={{ backgroundColor: '#F9D71C', color: '#121212' }}
                    >
                      FEATURED
                    </div>
                  )}
                </div>
                
                {/* Project Type and Cost - Moved below image */}
                <div className="px-3 pt-3 pb-1">
                  <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide mb-1">{project.projectType}</h2>
                  {project.cost && (
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">PROJECT COST:</span>
                      <div className="flex items-center">
                        <span className="font-mono text-gray-800 font-bold text-lg">$</span>
                        <span className="font-mono text-gray-800 font-bold text-lg">{project.cost}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="px-3 pt-1 pb-3" style={{ height: '70px' }}>
                  <p className="text-gray-700 leading-relaxed overflow-hidden text-sm" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{project.description}</p>
                </div>
                
                {/* Tags section removed as requested */}
                
                {/* Footer with Action Buttons */}
                <div className="px-4 py-2 flex justify-end">
                  <button 
                    className="px-3 py-1 text-xs text-gray-700 border border-gray-300 uppercase tracking-wide font-bold mr-2"
                    style={{ backgroundColor: 'white' }}
                  >
                    VIEW DETAILS
                  </button>
                  <button 
                    className="px-3 py-1 text-xs text-white uppercase tracking-wide font-bold"
                    style={{ backgroundColor: '#336699' }}
                  >
                    CONTACT
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-lg text-gray-600">No projects found matching your criteria.</p>
              <button 
                className="mt-4 px-4 py-2 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors font-medium"
                onClick={() => {
                  setFilter('all');
                  setSearchTerm('');
                }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gray-100 py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-gray-900">Ready to showcase your work?</h2>
            <p className="text-xl text-gray-600">
              Join thousands of contractors who use {APP_NAME} to manage their business and showcase their best projects.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="inline-flex items-center px-6 py-3 text-black bg-white rounded-[8px] hover:bg-gray-100 transition-colors font-medium"
            >
              Get Started Today
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 py-12">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Projects;
