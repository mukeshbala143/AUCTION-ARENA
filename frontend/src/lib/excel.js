import * as XLSX from 'xlsx'

export function downloadAllSquads(squads, code) {
  const wb = XLSX.utils.book_new()
  squads.forEach(sq => {
    const rows = (sq.players||[]).map((p,i)=>({
      '#':i+1,'Player':p.name,'Role':p.role,'Country':p.country,
      'Overseas':p.is_overseas?'Yes':'No','Capped':p.is_capped?'Capped':'Uncapped',
      'Batting':p.batting_style||'—','Bowling':p.bowling_style||'—',
      'Base(L)':p.base_price_lakhs,'Sold(L)':p.price_paid_lakhs,
      'IPL M':p.stats_total_ipl?.matches||0,'IPL Runs':p.stats_total_ipl?.runs||0,
      'IPL Wkts':p.stats_total_ipl?.wickets||0,'IPL Avg':p.stats_total_ipl?.average||0,
      'IPL SR':p.stats_total_ipl?.strike_rate||0,'T20 M':p.stats_total_t20?.matches||0,
      'T20 Runs':p.stats_total_t20?.runs||0,'T20 Wkts':p.stats_total_t20?.wickets||0,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, sq.team_name.slice(0,31))
  })
  XLSX.writeFile(wb, `AuctionArena_${code}.xlsx`)
}

export function downloadMyTeam(squad, code) {
  const wb = XLSX.utils.book_new()
  const rows = (squad.players||[]).map((p,i)=>({
    '#':i+1,'Player':p.name,'Role':p.role,'Country':p.country,
    'Overseas':p.is_overseas?'Yes':'No','Capped':p.is_capped?'Capped':'Uncapped',
    'Base(L)':p.base_price_lakhs,'Sold(L)':p.price_paid_lakhs,
    'IPL Runs':p.stats_total_ipl?.runs||0,'IPL Wkts':p.stats_total_ipl?.wickets||0,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, squad.team_name.slice(0,31))
  XLSX.writeFile(wb, `AuctionArena_${squad.team_name}_${code}.xlsx`)
}
