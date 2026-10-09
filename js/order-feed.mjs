// Firestore document identity is authoritative; editable payload fields must not replace it.
export function orderFromDocument(snapshot) {
 const path = snapshot.ref.path;
 const parts = path.split('/');
 if(parts.length!==4 || parts[2]!=='orders' || !['users','admins'].includes(parts[0]))return null;
 const data=snapshot.data();
 return {...data,id:String(snapshot.id),...(parts[0]==='users'?{userUID:parts[1]}:{_adminDocUID:parts[1]}),_orderPaths:[path]};
}
export function orderVersion(order) {
 const millis=value=>{
  if(value?.toMillis)return value.toMillis();
  if(value?.seconds)return value.seconds*1000+Math.floor((value.nanoseconds||0)/1e6);
  if(typeof value==='number')return value;
  const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0;
 };
 return Math.max(...['updatedAt','statusUpdatedAt','returnUpdatedAt'].map(key=>millis(order[key])));
}
export function mergeOrderSources(sources) {
 const merged=new Map();
 for(const {orders,priority=0} of [...sources].sort((a,b)=>(a.priority||0)-(b.priority||0))){
  for(const input of orders){
   if(!input || input.id==null)continue;
   const id=String(input.id);if(!id)continue;
   const order={...input,id},previous=merged.get(id);
   if(!previous){merged.set(id,order);continue;}
   const latest=orderVersion(order)>=orderVersion(previous)?order:previous;
   const older=latest===order?previous:order;
   merged.set(id,{...older,...latest,id,_orderPaths:[...new Set([...(previous._orderPaths||[]),...(order._orderPaths||[])])]});
  }
 }
 return [...merged.values()];
}
// Replacing a source removes disappeared documents. Previous rendered rows are never a source.
export class OrderFeed {
 constructor(){this.sources=new Map();this.generations=new Map();}
 begin(source){const generation=(this.generations.get(source)||0)+1;this.generations.set(source,generation);return generation;}
 replace(source,generation,orders,priority=0){if(this.generations.get(source)!==generation)return false;this.sources.set(source,{orders,priority});return true;}
 remove(source){this.begin(source);this.sources.delete(source);}
 values(){return mergeOrderSources([...this.sources.values()]);}
}
export function existingOrderPaths(order){
 const paths=new Set();
 // These paths originate only in Firestore snapshots, not stored document payloads.
 for(const path of order._orderPaths||[]){const parts=String(path).split('/');if(parts.length===4&&['users','admins'].includes(parts[0])&&parts[2]==='orders'&&parts[3]===String(order.id))paths.add(path);}
 if(order.userUID)paths.add(`users/${order.userUID}/orders/${order.id}`);
 for(const uid of new Set([order._adminDocUID,order.adminUID].filter(Boolean)))paths.add(`admins/${uid}/orders/${order.id}`);
 return [...paths].map(path=>path.split('/'));
}
