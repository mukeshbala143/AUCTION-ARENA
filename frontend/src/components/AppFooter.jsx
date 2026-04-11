import { Link } from 'react-router-dom'

export default function AppFooter() {
  return (
    <footer
      className="relative z-10 border-t px-4 sm:px-10 py-6 flex items-center justify-between flex-wrap gap-6 mt-10"
      style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}
    >
      <div className="flex flex-col items-center sm:items-start w-full sm:w-auto order-1">
        <span className="font-bebas text-xl tracking-[4px] text-gold">AUCTION ARENA</span>
        <span className="block text-muted text-xs mt-2">© 2026 Auction Arena · All rights reserved</span>
      </div>

      <div className="flex flex-row items-center justify-center gap-6 sm:gap-10 w-full sm:w-auto order-3 sm:order-2">
        <div className="flex flex-col items-center">
          <span className="text-muted text-[10px] uppercase tracking-widest mb-1 hidden sm:block">Developed By</span>
          <span className="text-white text-xs font-semibold mb-1.5">Subrata Bala</span>
          <div className="flex items-center gap-3">
            <a href="https://www.instagram.com/_itz.subrata" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#E1306C] transition-colors" title="Instagram">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a href="https://www.linkedin.com/in/subrata-bala-89516b302" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#0077B5] transition-colors" title="LinkedIn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z"/></svg>
            </a>
          </div>
        </div>

        <div className="w-px h-8" style={{ background: 'rgba(255,255,255,0.1)' }} />

        <div className="flex flex-col items-center">
          <span className="text-muted text-[10px] uppercase tracking-widest mb-1 opacity-0 sm:opacity-100 hidden sm:block">Developed By</span>
          <span className="text-white text-xs font-semibold mb-1.5">Mukesh Bala</span>
          <div className="flex items-center gap-3">
            <a href="https://www.instagram.com/mm__raj" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#E1306C] transition-colors" title="Instagram">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a href="https://www.linkedin.com/in/mukeshbala143" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#0077B5] transition-colors" title="LinkedIn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z"/></svg>
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4 sm:gap-6 order-2 sm:order-3 w-full sm:w-auto">
        <Link to="/dashboard?modal=privacy" className="text-muted text-xs hover:text-gold transition-colors no-underline">Privacy</Link>
        <Link to="/dashboard?modal=terms" className="text-muted text-xs hover:text-gold transition-colors no-underline">Terms</Link>
        <Link to="/dashboard?modal=contact" className="text-muted text-xs hover:text-gold transition-colors no-underline">Contact</Link>
        <Link to="/admin" className="text-muted text-xs hover:text-gold transition-colors no-underline">Admin</Link>
      </div>
    </footer>
  )
}
