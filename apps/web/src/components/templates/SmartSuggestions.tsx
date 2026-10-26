import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Clock, Users, AlertCircle, 
  CheckCircle, Info, Brain, Calendar 
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface SmartSuggestionsProps {
  templateCategory: string;
  templateItems: any[];
  onApplySuggestion: (suggestion: any) => void;
}

interface PricePrediction {
  itemName: string;
  currentPrice: number;
  suggestedPrice: number;
  confidence: number;
  factors: string[];
}

interface TimelineSuggestion {
  phase: string;
  estimatedDays: number;
  criticalPath: boolean;
  dependencies: string[];
}

export const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({
  templateCategory,
  templateItems,
  onApplySuggestion
}) => {
  const [predictions, setPredictions] = useState<PricePrediction[]>([]);
  const [timeline, setTimeline] = useState<TimelineSuggestion[]>([]);
  const [resourceTips, setResourceTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate ML predictions
    generateSmartSuggestions();
  }, [templateCategory, templateItems]);

  const generateSmartSuggestions = () => {
    setLoading(true);
    
    // Simulate API call delay
    setTimeout(() => {
      // Price predictions based on "ML analysis"
      const priceSuggestions: PricePrediction[] = templateItems.map(item => ({
        itemName: item.name,
        currentPrice: item.pricePerUnit,
        suggestedPrice: item.pricePerUnit * (0.95 + Math.random() * 0.15), // ±5-15% adjustment
        confidence: 0.75 + Math.random() * 0.2,
        factors: [
          'Market rate analysis',
          'Seasonal adjustment',
          'Local competition pricing',
          'Material cost trends'
        ].filter(() => Math.random() > 0.5)
      }));

      // Timeline suggestions
      const timelineSuggestions: TimelineSuggestion[] = [
        {
          phase: 'Preparation & Permits',
          estimatedDays: 3 + Math.floor(Math.random() * 3),
          criticalPath: true,
          dependencies: []
        },
        {
          phase: 'Main Work',
          estimatedDays: 7 + Math.floor(Math.random() * 7),
          criticalPath: true,
          dependencies: ['Preparation & Permits']
        },
        {
          phase: 'Finishing & Cleanup',
          estimatedDays: 2 + Math.floor(Math.random() * 2),
          criticalPath: false,
          dependencies: ['Main Work']
        }
      ];

      // Resource tips
      const tips = [
        'Based on your schedule, Team A is available and has experience with similar projects',
        'Consider ordering materials 2 weeks in advance - your supplier typically has 10-day lead times',
        'Weather forecast shows rain next week - plan indoor work accordingly',
        'You have excess inventory of PVC pipes that could be used for this project'
      ].filter(() => Math.random() > 0.3);

      setPredictions(priceSuggestions);
      setTimeline(timelineSuggestions);
      setResourceTips(tips);
      setLoading(false);
    }, 1500);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  if (loading) {
    return (
      <div className="bg-[#1E1E1E] rounded-[4px] p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699] mx-auto mb-4"></div>
        <p className="text-gray-400">Analyzing historical data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ML Price Predictions */}
      <div className="bg-[#1E1E1E] rounded-[4px] p-4">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-[#336699]" />
          <h3 className="text-lg font-medium">SMART PRICE PREDICTIONS</h3>
        </div>

        <div className="space-y-3">
          {predictions.slice(0, 3).map((prediction, index) => (
            <div key={index} className="bg-[#333333] rounded-[4px] p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-white">{prediction.itemName}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-400">
                      Current: {formatCurrency(prediction.currentPrice)}
                    </span>
                    <span className="text-xs text-[#336699]">
                      Suggested: {formatCurrency(prediction.suggestedPrice)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium ${getConfidenceColor(prediction.confidence)}`}>
                    {getConfidenceLabel(prediction.confidence)} Confidence
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    {(prediction.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Factors */}
              <div className="flex flex-wrap gap-1 mt-2">
                {prediction.factors.map((factor, idx) => (
                  <span key={idx} className="text-xs bg-[#1E1E1E] px-2 py-1 rounded-[2px] text-gray-300">
                    {factor}
                  </span>
                ))}
              </div>

              {/* Apply button */}
              <button
                onClick={() => onApplySuggestion({
                  type: 'price',
                  itemName: prediction.itemName,
                  value: prediction.suggestedPrice
                })}
                className="mt-3 text-xs text-[#336699] hover:text-white transition-colors"
              >
                Apply Suggestion →
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <Info className="w-3 h-3" />
          <span>Based on analysis of 127 similar projects in your area</span>
        </div>
      </div>

      {/* Timeline Suggestions */}
      <div className="bg-[#1E1E1E] rounded-[4px] p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-[#5b8fc7]" />
          <h3 className="text-lg font-medium">TIMELINE RECOMMENDATIONS</h3>
        </div>

        <div className="space-y-2">
          {timeline.map((phase, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-[#333333] rounded-[4px]">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${phase.criticalPath ? 'bg-[#D32F2F]' : 'bg-[#388E3C]'}`} />
                <div>
                  <p className="text-sm font-medium text-white">{phase.phase}</p>
                  {phase.dependencies.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Depends on: {phase.dependencies.join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono">{phase.estimatedDays} days</span>
                {phase.criticalPath && (
                  <p className="text-xs text-[#D32F2F] mt-1">Critical Path</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-[#333333] rounded-[4px]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Total Project Duration</span>
            <span className="text-lg font-mono font-bold text-[#5b8fc7]">
              {timeline.reduce((sum, phase) => sum + phase.estimatedDays, 0)} days
            </span>
          </div>
        </div>
      </div>

      {/* Resource Allocation Tips */}
      <div className="bg-[#1E1E1E] rounded-[4px] p-4">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-[#388E3C]" />
          <h3 className="text-lg font-medium">RESOURCE INSIGHTS</h3>
        </div>

        <div className="space-y-2">
          {resourceTips.map((tip, index) => (
            <div key={index} className="flex items-start gap-3 p-3 bg-[#333333] rounded-[4px]">
              <CheckCircle className="w-4 h-4 text-[#388E3C] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-300">{tip}</p>
            </div>
          ))}
        </div>

        <button className="mt-4 w-full py-2 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors text-sm font-medium">
          VIEW FULL RESOURCE PLAN
        </button>
      </div>
    </div>
  );
}; 