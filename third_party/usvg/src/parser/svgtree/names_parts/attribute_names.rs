// SPDX-License-Identifier: Apache-2.0 OR MIT

impl AId {
    pub(crate) fn from_str(text: &str) -> Option<AId> {
        ATTRIBUTES.get(text).cloned()
    }

    /// Returns the original string.
    #[inline(never)]
    pub fn to_str(self) -> &'static str {
        ATTRIBUTES.key(&self)
    }
}

impl std::fmt::Debug for AId {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", self.to_str())
    }
}

impl std::fmt::Display for AId {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

// A stripped down `phf` crate fork.
//
// https://github.com/sfackler/rust-phf

struct Map<V: 'static> {
    pub key: u64,
    pub disps: &'static [(u32, u32)],
    pub entries: &'static [(&'static str, V)],
}

impl<V: PartialEq> Map<V> {
    fn get(&self, key: &str) -> Option<&V> {
        let hash = hash(key, self.key);
        let index = get_index(hash, self.disps, self.entries.len());
        let entry = &self.entries[index as usize];
        let b = entry.0;
        if b == key {
            Some(&entry.1)
        } else {
            None
        }
    }

    fn key(&self, value: &V) -> &'static str {
        self.entries.iter().find(|kv| kv.1 == *value).unwrap().0
    }
}

#[inline]
fn hash(x: &str, key: u64) -> u64 {
    use std::hash::Hasher;

    let mut hasher = siphasher::sip::SipHasher13::new_with_keys(0, key);
    hasher.write(x.as_bytes());
    hasher.finish()
}

#[inline]
fn get_index(hash: u64, disps: &[(u32, u32)], len: usize) -> u32 {
    let (g, f1, f2) = split(hash);
    let (d1, d2) = disps[(g % (disps.len() as u32)) as usize];
    displace(f1, f2, d1, d2) % (len as u32)
}

#[inline]
fn split(hash: u64) -> (u32, u32, u32) {
    const BITS: u32 = 21;
    const MASK: u64 = (1 << BITS) - 1;

    ((hash & MASK) as u32,
     ((hash >> BITS) & MASK) as u32,
     ((hash >> (2 * BITS)) & MASK) as u32)
}

#[inline]
fn displace(f1: u32, f2: u32, d1: u32, d2: u32) -> u32 {
    d2 + f1 * d1 + f2
}
