import shutil, os
t, u, f = shutil.disk_usage(os.getcwd())
print("cwd", os.getcwd())
print("fs_total_gb", round(t / 2**30, 2))
print("fs_used_gb", round(u / 2**30, 2))
print("fs_free_gb", round(f / 2**30, 2))
