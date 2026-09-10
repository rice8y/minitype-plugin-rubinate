//! Rubinate's import-free WASM ABI. The host owns each allocated buffer and
//! releases it with `dealloc(pointer, length)`. Calls borrow the input and return
//! an owned output as a u64: pointer in the high 32 bits, length in the low 32.

#[no_mangle]
pub extern "C" fn alloc(length: u32) -> *mut u8 {
    Box::into_raw(vec![0u8; length as usize].into_boxed_slice()) as *mut u8
}

/// # Safety
/// `pointer` and `length` must describe a live buffer returned by this module.
/// Each buffer must be released exactly once, after all accesses have finished.
#[no_mangle]
pub unsafe extern "C" fn dealloc(pointer: *mut u8, length: u32) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
        pointer,
        length as usize,
    )));
}

/// # Safety
/// Input must refer to `length` initialized bytes in a live `alloc` buffer.
/// The caller retains ownership of the input and takes ownership of the output.
pub unsafe fn invoke(pointer: *const u8, length: u32, handler: fn(&[u8]) -> Vec<u8>) -> u64 {
    let input = std::slice::from_raw_parts(pointer, length as usize);
    let output = handler(input).into_boxed_slice();
    let length = u32::try_from(output.len()).expect("WASM result exceeds u32 length");
    let pointer = Box::into_raw(output) as *mut u8 as u32;
    ((pointer as u64) << 32) | length as u64
}
