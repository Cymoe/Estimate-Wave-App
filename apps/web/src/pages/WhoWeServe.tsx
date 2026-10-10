import { useNavigate } from "react-router-dom";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { useAuth } from "../contexts/AuthContext";
import { useEffect } from "react";
import {
  ArrowRight,
  Award,
  Building2,
  Crown,
  Hammer,
  Home,
  Lightbulb,
  Palette,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Wrench,
  Zap,
  Calculator,
  BarChart3
} from "lucide-react";
import { APP_NAME } from '@/config/brand';

export const WhoWeServe = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    document.body.classList.add('marketing-page');
    return () => {
      document.body.classList.remove('marketing-page');
    };
  }, []);

  useEffect(() => {
    if (user && !isLoading) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, isLoading, navigate]);

  const professionalCategories = [
    {
      icon: Crown,
      title: "Master Builders",
      tagline: "Visionaries Creating Tomorrow's Landmarks",
      description: "Elite construction professionals who transform blueprints into architectural masterpieces. Your expertise shapes skylines and communities.",
      examples: ["Custom Home Builders", "Commercial Developers", "Renovation Specialists"],
      color: "from-amber-500 to-orange-600"
    },
    {
      icon: BarChart3,
      title: "Real Estate Investors",
      tagline: "Strategic Visionaries Maximizing Returns",
      description: "Investment professionals who see opportunity where others see properties. Track renovation costs, analyze ROI, and make data-driven decisions that multiply your portfolio value.",
      examples: ["Fix & Flip Specialists", "BRRRR Investors", "Multi-Family Developers", "Portfolio Managers"],
      color: "from-emerald-500 to-green-600"
    },
    {
      icon: Wrench,
      title: "Trade Masters",
      tagline: "Precision Experts Perfecting Every Detail",
      description: "Skilled artisans whose craftsmanship sets the gold standard. Your specialized knowledge ensures excellence in every project.",
      examples: ["Master Plumbers", "Elite Electricians", "HVAC Innovators", "Flooring Artists"],
      color: "from-blue-500 to-indigo-600"
    },
    {
      icon: Sparkles,
      title: "Home Service Innovators",
      tagline: "Transforming Houses into Dream Homes",
      description: "Service professionals who bring comfort, beauty, and functionality to every space. Your work enhances lives daily.",
      examples: ["Interior Designers", "Landscaping Artists", "Pool & Spa Experts", "Smart Home Specialists"],
      color: "from-purple-500 to-pink-600"
    },
    {
      icon: Shield,
      title: "Property Care Experts",
      tagline: "Guardians of Value and Safety",
      description: "Maintenance professionals who protect and preserve investments. Your vigilance ensures lasting quality and peace of mind.",
      examples: ["Property Managers", "Maintenance Teams", "Restoration Specialists", "Security System Pros"],
      color: "from-gray-500 to-slate-600"
    }
  ];

  const successMetrics = [
    { icon: TrendingUp, label: "Average Revenue Growth", value: "47%", description: "in first year" },
    { icon: Calculator, label: "ROI Tracking", value: "3x", description: "better insights" },
    { icon: Users, label: "Repeat Business", value: "82%", description: "client retention" },
    { icon: Zap, label: "Time Saved", value: "15hrs", description: "per week" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <MarketingHeader useAuthButtons={true} showSignIn={false} />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-full mb-6">
            <Award className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-semibold text-blue-900">Built for Industry Leaders</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900">
            Where <span className="text-blue-600">Master Craftsmen</span> Build Their Legacy
          </h1>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {APP_NAME} isn't just software—it's your business command center. Designed for ambitious 
            professionals who refuse to settle for ordinary.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8">
            <button
              onClick={() => {
                const authButtons = document.querySelector('[data-testid="google-signin"]') as HTMLButtonElement;
                if (authButtons) authButtons.click();
              }}
              className="flex items-center justify-center px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all transform hover:scale-105"
            >
              Join Elite Professionals
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Professional Categories */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Empowering Every Trade Professional
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From skilled specialists to visionary builders, we understand what drives your success
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {professionalCategories.map((category, index) => {
              const Icon = category.icon;
              return (
                <div 
                  key={index}
                  className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group"
                >
                  <div className={`h-2 bg-gradient-to-r ${category.color}`} />
                  <div className="p-8">
                    <div className="flex items-start space-x-4 mb-6">
                      <div className={`p-3 rounded-lg bg-gradient-to-r ${category.color} text-white`}>
                        <Icon className="h-8 w-8" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900 mb-1">{category.title}</h3>
                        <p className="text-sm font-semibold text-gray-600">{category.tagline}</p>
                      </div>
                    </div>
                    
                    <p className="text-gray-700 mb-6">{category.description}</p>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Including:</p>
                      <div className="flex flex-wrap gap-2">
                        {category.examples.map((example, idx) => (
                          <span 
                            key={idx}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium"
                          >
                            {example}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Success Metrics */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Join the Winning Team
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Real results from professionals who've elevated their business with {APP_NAME}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {successMetrics.map((metric, index) => {
              const Icon = metric.icon;
              return (
                <div key={index} className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                    <Icon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{metric.value}</div>
                  <div className="text-sm font-semibold text-gray-600 mb-1">{metric.label}</div>
                  <div className="text-xs text-gray-500">{metric.description}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Professionals Choose Us */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Why Industry Leaders Choose {APP_NAME}
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                We've built features that matter to professionals who demand excellence
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white rounded-lg p-6 shadow-md">
                <Building2 className="h-12 w-12 text-blue-600 mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Professional Image</h3>
                <p className="text-gray-600">
                  Showcase your portfolio and expertise. Let your work speak for itself with our built-in project gallery.
                </p>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-md">
                <Lightbulb className="h-12 w-12 text-blue-600 mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Smart Business Tools</h3>
                <p className="text-gray-600">
                  From instant estimates to automated invoicing, work smarter not harder with intelligent features.
                </p>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-md">
                <Calculator className="h-12 w-12 text-blue-600 mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Investment Analysis</h3>
                <p className="text-gray-600">
                  Track project costs, analyze opportunity costs, and calculate ROI across your entire portfolio with precision.
                </p>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-md">
                <TrendingUp className="h-12 w-12 text-blue-600 mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Growth Focused</h3>
                <p className="text-gray-600">
                  Analytics and insights that help you identify opportunities and scale your business strategically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Ready to Join the Elite?
            </h2>
            <p className="text-xl text-blue-100">
              Your expertise deserves tools that match your ambition. Start building your legacy today.
            </p>
            <div className="pt-8">
              <button
                onClick={() => {
                  const authButtons = document.querySelector('[data-testid="google-signin"]') as HTMLButtonElement;
                  if (authButtons) authButtons.click();
                }}
                className="inline-flex items-center px-8 py-4 bg-white text-blue-600 rounded-lg hover:bg-gray-100 transition-all transform hover:scale-105 font-bold text-lg"
              >
                Start Your Success Story
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}; 