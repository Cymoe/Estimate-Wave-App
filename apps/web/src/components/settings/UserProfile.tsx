import { useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../contexts/AuthContext";
import { organizationsAPI } from "../../lib/api";
import { OrganizationContext } from "../layouts/DashboardLayout";
import { 
  Search, Plus, Settings, Camera, Award, Briefcase, 
  Target, TrendingUp, Star, Shield, Zap, Users, User,
  Building2, MapPin, Calendar, CheckCircle, Edit3,
  Trophy, Rocket, Heart, Palette, Code, Wrench,
  HardHat, Hammer, Ruler, Home, Building, Cpu,
  Share2, Copy, Download, Lock, Globe, Eye, EyeOff,
  DollarSign
} from "lucide-react";

export function UserProfile() {
  const { user } = useAuth();
  const { selectedOrg, setSelectedOrg } = useContext(OrganizationContext);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'skills' | 'achievements' | 'privacy'>('profile');
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [profilePublic, setProfilePublic] = useState(true);
  const [username, setUsername] = useState('myles-kameron');
  
  // Predefined options for skills and specialties
  const skillOptions = [
    { icon: HardHat, label: "Project Management", color: "bg-blue-500" },
    { icon: Hammer, label: "Construction", color: "bg-orange-500" },
    { icon: Ruler, label: "Design & Planning", color: "bg-purple-500" },
    { icon: Building2, label: "Commercial", color: "bg-green-500" },
    { icon: Home, label: "Residential", color: "bg-yellow-500" },
    { icon: Wrench, label: "Renovation", color: "bg-red-500" },
    { icon: Shield, label: "Safety Management", color: "bg-indigo-500" },
    { icon: Code, label: "BIM/CAD", color: "bg-pink-500" },
    { icon: Cpu, label: "Smart Home Tech", color: "bg-cyan-500" }
  ];

  const achievementTemplates = [
    { icon: "🏆", title: "Projects Completed", description: "Successfully delivered X projects" },
    { icon: "⭐", title: "Client Satisfaction", description: "Maintained 5-star rating" },
    { icon: "🎯", title: "On-Time Delivery", description: "100% on-time project completion" },
    { icon: "💰", title: "Revenue Generated", description: "Generated $X in revenue" },
    { icon: "🚀", title: "Business Growth", description: "Grew team from X to Y members" },
    { icon: "🏅", title: "Industry Recognition", description: "Received industry awards" }
  ];

  const [formData, setFormData] = useState({
    company: "",
    title: "",
    phone: "",
    address: "",
    bio: "",
    tagline: "",
    experience_years: 0,
    specialties: [] as string[],
    certifications: [] as string[],
    skills: [] as string[],
    achievements: [] as { icon: string; title: string; description: string }[],
    social_links: {
      linkedin: "",
      website: "",
      portfolio: ""
    }
  });

  // Company name, phone and address are the organization's, the ones printed on estimates.
  useEffect(() => {
    if (!user || !selectedOrg?.id) return;
    let cancelled = false;
    organizationsAPI
      .getById(selectedOrg.id)
      .then((org: { name?: string; phone?: string; address?: string } | null) => {
        if (cancelled) return;
        setFormData((current) => ({
          ...current,
          company: org?.name ?? "",
          phone: org?.phone ?? "",
          address: org?.address ?? "",
        }));
      })
      .catch((error: unknown) => {
        console.error('Error fetching business details:', error);
        toast.error('Failed to load profile data');
      });
    return () => {
      cancelled = true;
    };
  }, [user, selectedOrg?.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (!selectedOrg?.id) throw new Error('No organization selected');
      if (!formData.company.trim()) {
        toast.error("Company name is required.");
        return;
      }
      // Only the business details have a home on the backend; tagline, bio, skills etc. aren't stored yet.
      const org = await organizationsAPI.update(selectedOrg.id, {
        name: formData.company.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
      });
      if (org?.name) setSelectedOrg({ ...selectedOrg, name: org.name });
      toast.success("Company name, phone and address saved. They appear on your estimates.");
    } catch (error) {
      console.error("Profile update failed:", error);
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Hero Header with Profile Overview */}
      <div className="relative bg-gradient-to-br from-[#1E1E1E] via-[#252525] to-[#1E1E1E] border-b border-[#333333]">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }} />
        </div>

        <div className="relative px-6 py-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-start gap-6">
              {/* Avatar Section */}
              <div className="relative group">
                <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-[#333333] shadow-2xl">
                  {user?.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#3B82F6] to-[#1E40AF] flex items-center justify-center">
                      <span className="text-4xl font-bold text-white">
                        {(user?.user_metadata?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setEditingAvatar(true)}
                  className="absolute bottom-0 right-0 p-2 bg-[#EAB308] text-black rounded-full opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 translate-y-1 hover:scale-110"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              {/* Profile Info */}
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <h1 className="text-3xl font-bold text-white">
                    {user?.user_metadata?.full_name || 'Myles Kameron'}
                  </h1>
                  <span className="px-3 py-1 bg-[#EAB308]/20 text-[#EAB308] rounded-full text-sm font-medium">
                    Pro Member
                  </span>
                </div>
                
                {formData.tagline ? (
                  <p className="text-lg text-gray-300 mb-4">{formData.tagline}</p>
                ) : (
                  <p className="text-lg text-gray-500 italic mb-4">Add a professional tagline...</p>
                )}

                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span className="text-white font-medium">{formData.company || 'Add Company'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-gray-400" />
                    <span className="text-white font-medium">{formData.title || 'Add Title'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-white font-medium">{formData.address || 'Add Location'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-white font-medium">
                      {formData.experience_years > 0 ? `${formData.experience_years} years exp.` : 'Add Experience'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Profile Actions */}
              <div className="flex flex-col items-end gap-4">
                {/* Profile Completion Score */}
                <div className="text-center">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="#333333"
                        strokeWidth="8"
                        fill="none"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="#EAB308"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - 0.95)}`}
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">95%</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Profile Complete</p>
                </div>

                {/* Share Button */}
                <button
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#3B82F6] text-white rounded-lg hover:bg-[#2563EB] transition-all"
                >
                  <Share2 className="w-4 h-4" />
                  Share Profile
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 mt-8">
              <button
                onClick={() => setActiveSection('profile')}
                className={`px-6 py-3 rounded-t-lg font-medium transition-all ${
                  activeSection === 'profile'
                    ? 'bg-[#333333] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Profile Info
                </div>
              </button>
              <button
                onClick={() => setActiveSection('skills')}
                className={`px-6 py-3 rounded-t-lg font-medium transition-all ${
                  activeSection === 'skills'
                    ? 'bg-[#333333] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Skills & Expertise
                </div>
              </button>
              <button
                onClick={() => setActiveSection('achievements')}
                className={`px-6 py-3 rounded-t-lg font-medium transition-all ${
                  activeSection === 'achievements'
                    ? 'bg-[#333333] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Achievements
                </div>
              </button>
              <button
                onClick={() => setActiveSection('privacy')}
                className={`px-6 py-3 rounded-t-lg font-medium transition-all ${
                  activeSection === 'privacy'
                    ? 'bg-[#333333] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Privacy & Sharing
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto p-6">
        {/* Development Notice */}
        <div className="mb-6 p-4 bg-[#EAB308]/10 border border-[#EAB308]/30 rounded-lg">
          <p className="text-[#EAB308] text-sm">
            <strong>Note:</strong> This enhanced profile UI is a preview. Currently, only basic fields (company, title, phone, address, bio) are saved to the database. 
            Skills, achievements, and sharing features require additional database setup.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Profile Section */}
          {activeSection === 'profile' && (
            <div className="bg-[#333333] rounded-lg shadow-xl p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#3B82F6]" />
                    Professional Information
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Professional Tagline
                    </label>
                    <input
                      type="text"
                      name="tagline"
                      value={formData.tagline}
                      onChange={handleInputChange}
                      placeholder="e.g., Expert Builder | 20+ Years | Luxury Homes"
                      className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      name="company"
                      value={formData.company}
                      onChange={handleInputChange}
                      placeholder="Your Company Name"
                      className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Job Title
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder="e.g., CEO, Project Manager, Lead Contractor"
                      className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Years of Experience
                    </label>
                    <input
                      type="number"
                      name="experience_years"
                      value={formData.experience_years}
                      onChange={handleInputChange}
                      min="0"
                      max="50"
                      className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                    />
                  </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#10B981]" />
                    Contact & Location
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="(555) 123-4567"
                      className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Business Address
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="123 Main St, City, State 12345"
                      className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Professional Bio
                    </label>
                    <textarea
                      name="bio"
                      rows={4}
                      value={formData.bio}
                      onChange={handleInputChange}
                      placeholder="Tell us about your experience, specialties, and what makes you unique..."
                      className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Social Links */}
              <div className="mt-8 pt-8 border-t border-[#444444]">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                  <Heart className="w-5 h-5 text-[#EC4899]" />
                  Online Presence
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="url"
                    name="linkedin"
                    value={formData.social_links.linkedin}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, linkedin: e.target.value }
                    }))}
                    placeholder="LinkedIn Profile URL"
                    className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                  />
                  <input
                    type="url"
                    name="website"
                    value={formData.social_links.website}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, website: e.target.value }
                    }))}
                    placeholder="Company Website"
                    className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                  />
                  <input
                    type="url"
                    name="portfolio"
                    value={formData.social_links.portfolio}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, portfolio: e.target.value }
                    }))}
                    placeholder="Portfolio URL"
                    className="w-full bg-[#1E1E1E] border border-[#555555] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Skills Section */}
          {activeSection === 'skills' && (
            <div className="bg-[#333333] rounded-lg shadow-xl p-8">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-[#EAB308]" />
                Select Your Areas of Expertise
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {skillOptions.map((skill) => {
                  const Icon = skill.icon;
                  const isSelected = formData.skills.includes(skill.label);
                  return (
                    <button
                      key={skill.label}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setFormData(prev => ({
                            ...prev,
                            skills: prev.skills.filter(s => s !== skill.label)
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            skills: [...prev.skills, skill.label]
                          }));
                        }
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isSelected
                          ? `border-[#3B82F6] bg-[#3B82F6]/10 text-white`
                          : 'border-[#555555] hover:border-[#666666] text-gray-400 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-8 h-8 mx-auto mb-2 ${isSelected ? 'text-[#3B82F6]' : ''}`} />
                      <span className="text-sm font-medium">{skill.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Certifications */}
              <div className="pt-8 border-t border-[#444444]">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Award className="w-5 h-5 text-[#10B981]" />
                  Professional Certifications
                </h3>
                <div className="space-y-3">
                  {formData.certifications.map((cert, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-[#10B981]" />
                      <span className="text-white">{cert}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex items-center gap-2 text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Certification
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Achievements Section */}
          {activeSection === 'achievements' && (
            <div className="bg-[#333333] rounded-lg shadow-xl p-8">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                <Trophy className="w-5 h-5 text-[#EAB308]" />
                Showcase Your Achievements
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {achievementTemplates.map((template, index) => (
                  <div
                    key={index}
                    className="p-6 bg-[#252525] rounded-lg border border-[#444444] hover:border-[#555555] transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-3xl">{template.icon}</span>
                      <div className="flex-1">
                        <h4 className="text-white font-medium mb-1">{template.title}</h4>
                        <p className="text-gray-400 text-sm">{template.description}</p>
                      </div>
                      <Plus className="w-5 h-5 text-gray-500 group-hover:text-[#3B82F6] transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Section */}
          {activeSection === 'privacy' && (
            <div className="bg-[#333333] rounded-lg shadow-xl p-8">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                <Lock className="w-5 h-5 text-[#EC4899]" />
                Privacy & Sharing Settings
              </h3>

              {/* Public Profile Toggle */}
              <div className="mb-8 p-6 bg-[#252525] rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-white font-medium mb-1">Public Profile</h4>
                    <p className="text-gray-400 text-sm">Make your profile visible to anyone with the link</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfilePublic(!profilePublic)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      profilePublic ? 'bg-[#3B82F6]' : 'bg-[#555555]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        profilePublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {profilePublic && (
                  <div className="mt-4 p-4 bg-[#1E1E1E] rounded-lg">
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Custom Username
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">yourapp.com/pro/</span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="john-smith"
                        className="flex-1 bg-[#0A0A0A] border border-[#555555] rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Privacy Settings */}
              <div className="space-y-4">
                <h4 className="text-white font-medium mb-4">What to Show on Public Profile</h4>
                
                <label className="flex items-center justify-between p-4 bg-[#252525] rounded-lg cursor-pointer hover:bg-[#2A2A2A] transition-all">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-gray-400" />
                    <div>
                      <span className="text-white">Revenue Statistics</span>
                      <p className="text-gray-400 text-xs">Show total revenue and project values</p>
                    </div>
                  </div>
                  <input type="checkbox" className="w-4 h-4 text-[#3B82F6] rounded" />
                </label>

                <label className="flex items-center justify-between p-4 bg-[#252525] rounded-lg cursor-pointer hover:bg-[#2A2A2A] transition-all">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-gray-400" />
                    <div>
                      <span className="text-white">Client List</span>
                      <p className="text-gray-400 text-xs">Display your client portfolio</p>
                    </div>
                  </div>
                  <input type="checkbox" className="w-4 h-4 text-[#3B82F6] rounded" />
                </label>

                <label className="flex items-center justify-between p-4 bg-[#252525] rounded-lg cursor-pointer hover:bg-[#2A2A2A] transition-all">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-gray-400" />
                    <div>
                      <span className="text-white">Exact Numbers</span>
                      <p className="text-gray-400 text-xs">Show exact values instead of ranges</p>
                    </div>
                  </div>
                  <input type="checkbox" className="w-4 h-4 text-[#3B82F6] rounded" />
                </label>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-8 py-3 bg-[#EAB308] text-black font-medium rounded-lg hover:bg-[#F59E0B] transition-all transform hover:scale-105 ${
                isSubmitting ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isSubmitting ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1A1A] rounded-xl p-8 max-w-md w-full border border-[#333333]">
            <h3 className="text-xl font-bold text-white mb-6">Share Your Profile</h3>
            
            {profilePublic ? (
              <>
                {/* QR Code */}
                <div className="flex justify-center mb-6">
                  <div className="p-4 bg-white rounded-lg">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/pro/${username || 'username'}`)}`} 
                      alt="QR Code" 
                    />
                  </div>
                </div>

                {/* Share Options */}
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/pro/${username || 'username'}`);
                      toast.success('Link copied to clipboard!');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#252525] text-white rounded-lg hover:bg-[#333333] transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Link
                  </button>
                  
                  <button
                    onClick={() => window.print()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#252525] text-white rounded-lg hover:bg-[#333333] transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>

                  <div className="pt-3">
                    <input
                      type="text"
                      value={`${window.location.origin}/pro/${username || 'username'}`}
                      readOnly
                      className="w-full px-4 py-2 bg-[#0A0A0A] text-gray-400 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <Lock className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">Your profile is currently private</p>
                <button
                  onClick={() => {
                    setActiveSection('privacy');
                    setShowShareModal(false);
                  }}
                  className="px-6 py-2 bg-[#3B82F6] text-white rounded-lg hover:bg-[#2563EB] transition-all"
                >
                  Go to Privacy Settings
                </button>
              </div>
            )}

            <button
              onClick={() => setShowShareModal(false)}
              className="w-full mt-6 px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
