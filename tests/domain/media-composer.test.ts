import { expect, it } from "vitest";
import { cropRectangle, mediaSelectionError } from "../../lib/domain/media-composer";
it("accepts a video or a photo carousel but rejects mixed and oversized selections", () => {
 const photo = { type: "image/jpeg", size: 1000 }, video = { type: "video/mp4", size: 1000 };
 expect(mediaSelectionError([video])).toBeNull(); expect(mediaSelectionError([photo, photo])).toBeNull();
 for (const files of [[], [photo, video], [video, video], Array(11).fill(photo), [{...photo,size:13*1024*1024}], [{...video,size:101*1024*1024}], [{type:"image/heic",size:1000}]]) expect(mediaSelectionError(files)).not.toBeNull();
});
it("keeps portrait and landscape crops inside the original image at every pan boundary", () => {
 for(const [w,h] of [[4000,3000],[3000,4000]]) for(const ratio of [1,9/16,4/5,16/9]) for(const zoom of [1,2,3]) for(const x of [0,.5,1]) for(const y of [0,.5,1]) {
 const r=cropRectangle(w,h,ratio,zoom,x,y); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.x+r.width).toBeLessThanOrEqual(w+.00001); expect(r.y+r.height).toBeLessThanOrEqual(h+.00001); expect(r.width/r.height).toBeCloseTo(ratio);
 }
});
