import {auth,db} from './firebase-admin-client.js';
import {onAuthStateChanged,setPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {collection,onSnapshot,collectionGroup,doc,addDoc,updateDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {escapeHTML,validateProduct} from './commerce.mjs';
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'});
let products=[],editingId=null,draftImages=[],unsubscribers=[],inventoryPage=1,draftImageSequence=0;
const INVENTORY_PAGE_SIZE=8;
const fields={name:$('pname'),price:$('pprice'),quantity:$('pquantity'),returnDays:$('preturnDays'),deliveryCharge:$('pdeliveryCharge'),description:$('pdesc'),category:$('pcategory'),featured:$('pfeatured')};
const imagesFor=p=>Array.isArray(p.imageUrls)&&p.imageUrls.filter(Boolean).length?p.imageUrls.filter(Boolean):p.imageUrl?[p.imageUrl]:[];
function message(text,error=false){$('productFormMessage').textContent=text;$('productFormMessage').classList.toggle('error',error);}
async function confirmProductDelete(productName){
 const prompt=`Delete “${productName}” from the catalog? Existing order records will remain.`;
 if(typeof window.trendoraDialog?.confirm==='function')return window.trendoraDialog.confirm(prompt);
 return window.confirm(prompt);
}
function deleteErrorMessage(error){
 if(error?.code==='permission-denied')return 'Deletion was blocked by Firestore permissions. Sign in again with the admin account and try once more.';
 if(error?.code==='unavailable')return 'Could not reach the catalog. Check your connection and try again.';
 return `Could not delete product: ${error?.message||'Unknown error'}`;
}
function clearDraftImages(){for(const image of draftImages)if(image.objectUrl)URL.revokeObjectURL(image.url);draftImages=[];}
function renderDraftImages(){const host=$('preview');host.replaceChildren();for(const image of draftImages){const card=document.createElement('div');card.className=`image-draft${image.cover?' is-cover':''}`;card.innerHTML=`${image.cover?'<span class="image-draft__cover">COVER</span>':''}<img src="${escapeHTML(image.url)}" alt="Product image preview"><div class="image-draft__tools"><button type="button" class="cover-image-btn" ${image.cover?'disabled':''}>${image.cover?'Cover photo':'Make cover'}</button><button type="button" class="remove-image-btn">Remove</button></div>`;card.querySelector('.cover-image-btn').onclick=()=>{draftImages.forEach(item=>item.cover=item.id===image.id);renderDraftImages();};card.querySelector('.remove-image-btn').onclick=()=>{if(draftImages.length===1){message('A product needs at least one photo.',true);return;}if(image.objectUrl)URL.revokeObjectURL(image.url);draftImages=draftImages.filter(item=>item.id!==image.id);if(!draftImages.some(item=>item.cover))draftImages[0].cover=true;renderDraftImages();};host.appendChild(card);}host.style.display=draftImages.length?'grid':'none';}
function setExistingDraftImages(urls,coverUrl=''){clearDraftImages();draftImages=urls.map((url,index)=>({id:`existing-${++draftImageSequence}`,url,cover:url===coverUrl||(index===0&&!coverUrl),objectUrl:false}));renderDraftImages();}
function addSelectedImages(files){if(!files.length)return;if(draftImages.length+files.length>6||files.some(file=>!file.type.startsWith('image/')||file.size>8*1024*1024)){message('Choose up to 6 images, no larger than 8 MB each.',true);return;}for(const file of files){const url=URL.createObjectURL(file);draftImages.push({id:`upload-${++draftImageSequence}`,url,file,objectUrl:true,cover:!draftImages.length});}renderDraftImages();}
function reset(){editingId=null;Object.values(fields).forEach(f=>f.type==='checkbox'?f.checked=false:f.value='');$('pimage').value='';clearDraftImages();renderDraftImages();$('formTitle').textContent='Add product';$('addBtn').innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>Add Product';$('cancelEditBtn').hidden=true;}
function edit(product){editingId=product.id;for(const [key,field] of Object.entries(fields)){if(field.type==='checkbox')field.checked=product[key]===true;else field.value=product[key]??'';}$('pimage').value='';setExistingDraftImages(imagesFor(product),product.imageUrl);$('formTitle').textContent='Edit product';$('addBtn').textContent='Save changes';$('cancelEditBtn').hidden=false;message('Editing '+product.name+'. Choose a cover photo or remove images, then save.');fields.name.scrollIntoView({behavior:'smooth',block:'center'});fields.name.focus();}
function getPageNumbers(currentPage,totalPages){
 const start=Math.max(1,Math.min(currentPage-2,totalPages-4));
 const end=Math.min(totalPages,start+4);
 return Array.from({length:end-start+1},(_,index)=>start+index);
}
function renderPagination(totalPages,totalItems,startIndex,endIndex){
 const host=$('inventoryPagination');
 host.hidden=totalPages<=1;
 if(totalPages<=1){host.innerHTML='';return;}
 const pages=getPageNumbers(inventoryPage,totalPages);
 host.innerHTML=`<span>Showing ${startIndex}–${endIndex} of ${totalItems} products</span><div class="inventory-pagination__controls"><button type="button" data-page="${inventoryPage-1}" ${inventoryPage===1?'disabled':''}>Previous</button>${pages.map(page=>`<button type="button" data-page="${page}" class="${page===inventoryPage?'active':''}" ${page===inventoryPage?'aria-current="page"':''}>${page}</button>`).join('')}<button type="button" data-page="${inventoryPage+1}" ${inventoryPage===totalPages?'disabled':''}>Next</button></div>`;
 host.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{if(button.disabled)return;inventoryPage=Number(button.dataset.page);render();$('productList').scrollIntoView({behavior:'smooth',block:'start'});});
}
function render(){
 const q=$('inventorySearch').value.trim().toLowerCase(),filter=$('inventoryFilter').value;
 const list=products.filter(p=>(p.name+' '+(p.category||'')).toLowerCase().includes(q)).filter(p=>filter==='all'||(filter==='available'&&p.quantity>0)||(filter==='low'&&p.quantity>0&&p.quantity<=5)||(filter==='out'&&!(p.quantity>0)));
 const totalPages=Math.max(1,Math.ceil(list.length/INVENTORY_PAGE_SIZE));inventoryPage=Math.min(inventoryPage,totalPages);
 const start=(inventoryPage-1)*INVENTORY_PAGE_SIZE,pageItems=list.slice(start,start+INVENTORY_PAGE_SIZE);
 $('inventoryCount').textContent=list.length?`Showing ${start+1}–${Math.min(start+INVENTORY_PAGE_SIZE,list.length)} of ${list.length} products`:'No products match your filters.';$('productCount').textContent=products.length;$('productList').setAttribute('aria-busy','false');
 $('productList').innerHTML=list.length?'':'<div class="empty">No products match your filters.</div>';
 for(const p of pageItems){const row=document.createElement('article');row.className='product-card inventory-row';const image=imagesFor(p)[0],delivery=Number(p.deliveryCharge||0);row.innerHTML=`<div class="inventory-photo">${image?`<img src="${escapeHTML(image)}" alt="${escapeHTML(p.name)}">`:'<span>No photo</span>'}</div><div class="inventory-info"><span class="inventory-category">${escapeHTML(p.category||'Uncategorized')}${p.featured?' · Featured':''}</span><h3>${escapeHTML(p.name||'Untitled product')}</h3><p>${money.format(Number(p.price||0))} <span class="stock-pill ${Number(p.quantity)<=5?'low':''}">${Number(p.quantity||0)} in stock</span></p><p class="inventory-description">Delivery: ${money.format(delivery)} per unit · ${escapeHTML(p.description||'No description added.')}</p><div class="actions"><button class="btn secondary editBtn" type="button">Edit product</button><button class="btn ${p.featured?'secondary':'featureToggleBtn'} featureToggleBtn" type="button">${p.featured?'Remove feature':'Feature on home'}</button><a class="catalog-preview" href="product-details.html?id=${encodeURIComponent(p.id)}">View in store ↗</a><button class="deleteBtn" type="button" aria-label="Delete ${escapeHTML(p.name)}">Delete</button></div></div>`;
 row.querySelector('.editBtn').onclick=()=>edit(p);
 row.querySelector('.featureToggleBtn').onclick=async event=>{const btn=event.currentTarget;const next=!p.featured;btn.disabled=true;btn.textContent=next?'Featuring…':'Removing…';try{await updateDoc(doc(db,'products',p.id),{featured:next});message(next?`${p.name} is now featured on the homepage.`:`${p.name} was removed from the homepage.`);}catch(error){message(error.message||'Could not update homepage feature.',true);btn.disabled=false;btn.textContent=p.featured?'Remove feature':'Feature on home';}};
 row.querySelector('.deleteBtn').onclick=async event=>{
  const btn=event.currentTarget;
  if(!await confirmProductDelete(p.name||'this product'))return;
  const originalLabel=btn.textContent;
  btn.disabled=true;btn.textContent='Deleting…';
  try{
   await deleteDoc(doc(db,'products',p.id));
   products=products.filter(product=>product.id!==p.id);
   if(editingId===p.id)reset();
   render();
   message('Product deleted from the catalog.');
  }catch(error){
   console.error('Product deletion failed',error);
   message(deleteErrorMessage(error),true);
   btn.disabled=false;btn.textContent=originalLabel;
  }
 };
 $('productList').appendChild(row);
 }
 renderPagination(totalPages,list.length,start+1,Math.min(start+INVENTORY_PAGE_SIZE,list.length));
}
$('inventorySearch').addEventListener('input',()=>{inventoryPage=1;render();});$('inventoryFilter').addEventListener('change',()=>{inventoryPage=1;render();});$('cancelEditBtn').onclick=()=>{reset();message('Edit cancelled.');};
$('pimage').addEventListener('change',()=>{addSelectedImages([...$('pimage').files]);$('pimage').value='';});
$('addBtn').addEventListener('click',async()=>{
 if($('addBtn').disabled)return;
 try{
  const payload=validateProduct(Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.type==='checkbox'?field.checked:field.value])));
  if(!draftImages.length)throw new Error('Add at least one actual product photo.');
  const uploadCount=draftImages.filter(image=>image.file).length;
  $('addBtn').disabled=true;$('cancelEditBtn').disabled=true;message(uploadCount?'Uploading product photos…':'Saving product…');
  const resolved=await Promise.all(draftImages.map(async image=>{if(!image.file)return image.url;const data=new FormData();data.append('file',image.file);data.append('upload_preset','unsigned_upload');const response=await fetch('https://api.cloudinary.com/v1_1/dwz1jxty5/image/upload',{method:'POST',body:data});const result=await response.json();if(!response.ok||!result.secure_url)throw new Error(result.error?.message||'Photo upload failed.');return result.secure_url;}));
  const coverIndex=Math.max(0,draftImages.findIndex(image=>image.cover));
  const imageUrls=[resolved[coverIndex],...resolved.filter((_,index)=>index!==coverIndex)];
  payload.imageUrls=imageUrls;payload.imageUrl=imageUrls[0];
  if(editingId)await updateDoc(doc(db,'products',editingId),payload);else await addDoc(collection(db,'products'),{...payload,createdAt:serverTimestamp()});
  reset();message('Product saved. Your storefront is up to date.');
 }catch(e){message(e.message||'Could not save product.',true);}finally{$('addBtn').disabled=false;$('cancelEditBtn').disabled=false;}
});
await setPersistence(auth,browserSessionPersistence);
onAuthStateChanged(auth,user=>{
 unsubscribers.forEach(stop=>stop());unsubscribers=[];
 if(!user||user.email?.toLowerCase()!=='anshbajpai3@gmail.com'){location.replace('admin-login.html');return;}
 unsubscribers.push(onSnapshot(collection(db,'products'),snapshot=>{products=snapshot.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));$('lowStockCount').textContent=products.filter(product=>{const quantity=Number(product.quantity||0);return quantity>0&&quantity<=5;}).length;render();},error=>{$('productList').setAttribute('aria-busy','false');$('productList').innerHTML='<div class="empty">Could not load inventory. Reload to try again.</div>';message(error.message,true);}));
 unsubscribers.push(onSnapshot(collection(db,'users'),snapshot=>$('userCount').textContent=snapshot.size,()=>{$('userCount').textContent='—';}));
 unsubscribers.push(onSnapshot(collection(db,'discountCodes'),snapshot=>{const codes=snapshot.docs.map(d=>d.data());$('activeCodeCount').textContent=codes.filter(c=>c.status!=='disabled'&&(!c.expiresAt||new Date(c.expiresAt+'T23:59:59+05:30')>=new Date())&&(!c.maxUses||Number(c.usedCount||0)<Number(c.maxUses))).length;$('redemptionCount').textContent=codes.reduce((n,c)=>n+Number(c.usedCount||0),0);},()=>{$('activeCodeCount').textContent='—';$('redemptionCount').textContent='—';}));
 unsubscribers.push(onSnapshot(collectionGroup(db,'orders'),snapshot=>{
  const canonical=new Map();
  snapshot.docs.filter(d=>d.ref.path.startsWith('admins/')).forEach(d=>{const order={id:d.id,...d.data()};const prior=canonical.get(order.id);const newer=Date.parse(order.updatedAt||order.statusUpdatedAt||0)||0;if(!prior||newer>(Date.parse(prior.updatedAt||prior.statusUpdatedAt||0)||0))canonical.set(order.id,order);});
  const orders=[...canonical.values()];const open=orders.filter(order=>!['Cancelled','Cancelled by User','Delivered','Completed'].includes(order.orderStatus||'Pending'));
  $('openOrderCount').textContent=open.length;
  $('orderValue').textContent=money.format(orders.filter(order=>!['Cancelled','Cancelled by User'].includes(order.orderStatus||'')).reduce((sum,order)=>sum+Number(order.totalAmount||0),0));
 },()=>{$('openOrderCount').textContent='—';$('orderValue').textContent='—';}));
});
