import { useState } from 'react';
import { supabase } from '../lib/supabase'; // Import your actual Supabase client

const BUCKET_NAME = 'player-images'; // Make sure you create this bucket in your Supabase project

const SportForm = ({ sport }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    const formData = new FormData(e.target);
    const formEntries = Object.fromEntries(formData.entries());
    const { image_file, ...playerData } = formEntries;
    playerData.sport = sport; // Add the sport to the data

    // 1. Handle Image Upload to Supabase Storage
    if (image_file && image_file.size > 0) {
      const fileExt = image_file.name.split('.').pop();
      const fileName = `${playerData.name.replace(/\s+/g, '-')}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, image_file);

      if (uploadError) {
        setError(`Failed to upload image: ${uploadError.message}`);
        setIsSubmitting(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
      playerData.image_url = publicUrl;
    }

    const { error } = await supabase.from('players').insert(playerData);

    if (error) {
      setError(`Failed to add player: ${error.message}`);
    } else {
      setSuccess(`Successfully added ${playerData.name} to the ${sport} database!`);
      e.target.reset();
    }
    setIsSubmitting(false);
  };

  // Basic form structure - we'll show the detailed cricket form
  if (sport === 'cricket') {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="p-3 bg-red-900/50 text-red-300 border border-red-700 rounded-lg text-sm">{error}</div>}
        {success && <div className="p-3 bg-green-900/50 text-green-300 border border-green-700 rounded-lg text-sm">{success}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Player Name</label>
            <input name="name" type="text" className="aa-input" required placeholder="e.g., Virat Kohli" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Player Image</label>
            <input name="image_file" type="file" className="aa-input" accept="image/png, image/jpeg, image/webp" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Country</label>
            <input name="country" type="text" className="aa-input" required placeholder="e.g., India" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Role</label>
            <select name="role" className="aa-input">
              <option>Batsman</option>
              <option>Bowler</option>
              <option>All-Rounder</option>
              <option>Wicketkeeper</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Base Price (in Lakhs)</label>
            <input name="base_price" type="number" className="aa-input" required placeholder="e.g., 200" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Player Type</label>
            <select name="type" className="aa-input">
              <option>Capped</option>
              <option>Uncapped</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Batting Style</label>
            <select name="batting_style" className="aa-input">
              <option>Right-handed</option>
              <option>Left-handed</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted tracking-wider">Bowling Style</label>
            <input name="bowling_style" type="text" className="aa-input" placeholder="e.g., Right-arm fast-medium" />
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <button type="submit" disabled={isSubmitting} className="btn-gold w-full" style={{padding:'0.8rem'}}>
            {isSubmitting ? 'Adding Player...' : `Add Player to ${sport.charAt(0).toUpperCase() + sport.slice(1)}`}
          </button>
        </div>
      </form>
    );
  }

  // Placeholder for other sports
  return (
    <div className="text-center py-16">
      <h3 className="text-2xl font-bebas tracking-wider">Add Player to {sport.charAt(0).toUpperCase() + sport.slice(1)}</h3>
      <p className="text-muted">Form for this sport has not been implemented yet.</p>
    </div>
  );
};

export default function AdminPage() {
  const [activeSport, setActiveSport] = useState('cricket');
  const sports = ['cricket', 'kabaddi', 'football'];

  return (
    <div className="min-h-screen bg-bg text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-bebas text-5xl tracking-[4px] mb-2">Admin <span className="text-gold">Panel</span></h1>
        <p className="text-muted mb-8">Add, edit, and manage players for all auction arenas.</p>

        <div className="bg-[#13131f] border border-white/10 rounded-2xl">
          <div className="p-4 border-b border-white/10">
            <div className="flex gap-2">
              {sports.map(sport => (
                <button
                  key={sport}
                  onClick={() => setActiveSport(sport)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeSport === sport
                      ? 'bg-gold text-black'
                      : 'bg-transparent text-muted hover:bg-white/5'
                  }`}
                >
                  {sport.charAt(0).toUpperCase() + sport.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="p-8">
            <SportForm sport={activeSport} />
          </div>
        </div>
      </div>
    </div>
  );
}